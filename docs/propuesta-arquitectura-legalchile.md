# Propuesta de Arquitectura - Migración PSL a SaaS (LegalChile)

## Documento Complementario: Revisión y Elementos Faltantes

---

## 1. Mapeo Completo de Requerimientos

### Requerimientos cubiertos en la propuesta original
| Req | Tema | Estado |
|-----|------|--------|
| 1 | Acceso remoto | Cubierto |
| 2 | Autenticación Microsoft | Cubierto |
| 5 | Modularidad | Cubierto |
| 9 | Migración de datos | Cubierto |
| 10 | Logging y monitoreo | Cubierto |

### Requerimientos NO cubiertos (deben completarse)
| Req | Tema probable | Propuesta de cobertura |
|-----|--------------|----------------------|
| 3 | Disponibilidad y uptime | SLA 99.9% con Aurora Multi-AZ, ALB multi-zona, health checks automatizados |
| 4 | Escalabilidad | Auto-scaling en ECS Fargate (horizontal), Aurora Auto Scaling para réplicas de lectura |
| 6 | Independencia de proveedor | Containerización con Docker, evitar servicios propietarios donde sea posible, usar PostgreSQL estándar |
| 7 | Costos predecibles | Modelo pay-per-use con Reserved Instances para la base, alertas de billing en AWS Budgets |
| 8 | Cumplimiento normativo | Datos en región sa-east-1 (São Paulo), cifrado en reposo (KMS) y en tránsito (TLS 1.3), auditoría con CloudTrail |

---

## 2. Correcciones a la Arquitectura Propuesta

### 2.1 Postura arquitectónica: Monolito Modular (no microservicios)

La propuesta original mezcla ambos enfoques. La recomendación correcta para el contexto de LegalChile es:

**Fase 1 (0-18 meses): Monolito Modular en contenedores**
- Una sola aplicación NestJS (Node.js/TypeScript) organizada en módulos internos
- Cada módulo encapsula un bounded context: `atenciones`, `afiliados`, `facturacion`, `comite`, `cargas-masivas`, `reportes`
- Los módulos se comunican por interfaces internas, no por red
- Desplegado en AWS ECS Fargate (contenedores serverless)

**Fase 2 (solo si se necesita):** Extraer módulos de alta carga a servicios independientes.

**Justificación:** Un equipo de desarrollo pequeño/mediano no puede operar microservicios distribuidos con la complejidad que implica (service mesh, distributed tracing, eventual consistency). El monolito modular ofrece la misma modularidad lógica sin la complejidad operativa.

### 2.2 Corrección del Frontend

| Aspecto | Propuesta original | Corrección |
|---------|-------------------|------------|
| SSR | Angular Universal | `@angular/ssr` con hydration nativa (Angular 19+) |
| Justificación Angular | "Robustez" | Correcto, pero agregar: tipado estricto, DI nativo, formularios reactivos complejos — ideal para flujos legales multi-paso |
| Tiempo real | WebSockets genérico | AWS AppSync o Socket.io sobre ECS con Redis Pub/Sub como broker |
| UI Components | No especificado | Angular Material o PrimeNG para componentes empresariales |

### 2.3 Corrección del Backend

| Aspecto | Propuesta original | Corrección |
|---------|-------------------|------------|
| Compute | Lambda para todo | ECS Fargate para la aplicación principal + Lambda solo para tareas event-driven (cargas masivas, notificaciones) |
| Orquestación | No mencionada | AWS Step Functions para flujos legales de larga duración (juicios, comités con aprobaciones) |
| Cola de mensajes | No mencionada | Amazon SQS para desacoplar cargas masivas y envío de emails |
| Caché | No mencionado | Amazon ElastiCache (Redis) para sesiones y datos de catálogo |

**Por qué no Lambda para todo:**
- Los flujos legales (crear consulta -> asignar abogado -> registrar gestiones -> comité -> cierre) son procesos de larga duración con estado
- Lambda tiene cold starts que degradan UX en aplicaciones interactivas
- La lógica de negocio compleja del Anexo requiere transacciones ACID que son difíciles de coordinar entre Lambdas

### 2.4 Corrección de Identidad

| Propuesta original | Corrección |
|-------------------|------------|
| AWS Cognito federado con Entra ID | Microsoft Entra ID directo como IdP (protocolo OIDC) |

**Justificación:** Si LegalChile ya paga Microsoft 365, Entra ID ya está incluido. Agregar Cognito como intermediario suma complejidad y costo sin beneficio. La aplicación Angular usa MSAL.js para autenticarse contra Entra ID directamente, y el backend valida los tokens JWT de Entra ID.

---

## 3. Componentes de Arquitectura Faltantes

### 3.1 Almacenamiento de Documentos

Elemento completamente ausente en la propuesta original. En un sistema legal, la gestión documental es central.

```
Flujo de documentos:
Usuario sube archivo -> API genera presigned URL de S3
                     -> Archivo va directo a S3 (no pasa por el servidor)
                     -> Metadata se guarda en PostgreSQL
                     -> S3 Event -> Lambda de indexación -> OpenSearch
```

| Componente | Servicio AWS |
|-----------|-------------|
| Almacenamiento de archivos | Amazon S3 (bucket privado, versionado, lifecycle policies) |
| Búsqueda full-text en documentos | Amazon OpenSearch (para buscar dentro de escritos, resoluciones) |
| Procesamiento de PDFs/imágenes | Amazon Textract (OCR para documentos escaneados) |
| Antivirus en uploads | ClamAV en Lambda o S3 Object Lambda |

**Política de retención:** Los documentos legales en Chile deben conservarse mínimo 5 años. Configurar S3 Intelligent-Tiering para mover documentos antiguos a almacenamiento frío automáticamente.

### 3.2 Búsqueda Avanzada

El Anexo describe búsquedas complejas (por RUT, correlativo, materia, competencia, abogado, estado). Se necesita:

- **Búsquedas operacionales:** Índices compuestos en PostgreSQL (B-tree para exactas, GIN para full-text en español)
- **Búsquedas analíticas:** Amazon OpenSearch para búsquedas complejas con facets, autocompletado y relevancia

### 3.3 CDN y Assets Estáticos

| Componente | Servicio |
|-----------|---------|
| CDN | Amazon CloudFront |
| Assets del frontend | S3 + CloudFront |
| Dominio y DNS | Amazon Route 53 |
| Certificados SSL | AWS Certificate Manager (ACM) |

### 3.4 Sistema de Notificaciones

```
Eventos del sistema -> Amazon EventBridge -> Reglas de enrutamiento
                                          |-> SQS -> Lambda: Email (Amazon SES)
                                          |-> SQS -> Lambda: Notificación in-app (WebSocket)
                                          |-> SQS -> Lambda: Alerta a supervisores
```

Casos de uso:
- Vencimiento de plazos de gestión (juicios, comité)
- Nuevas atenciones asignadas
- Cargas masivas completadas/fallidas
- Alertas de pagos WebPay

### 3.5 Integración con WebPay

```
Frontend -> Backend (POST /api/v1/pagos/iniciar)
         -> WebPay SDK (crear transacción)
         -> Redirect a WebPay
         -> WebPay callback -> Backend (POST /api/v1/pagos/confirmar)
         -> Actualizar estado en DB
         -> Notificar al usuario
```

Consideraciones:
- Usar ambiente de integración de Transbank para desarrollo
- Almacenar tokens de transacción con cifrado (KMS)
- Implementar idempotencia en el endpoint de confirmación
- Logs de auditoría para cada transacción (requisito SII/normativo)

### 3.6 Reportería y BI

| Necesidad | Solución |
|-----------|---------|
| Reportes operacionales (listados, estados) | Queries directas a réplica de lectura de Aurora |
| Reportes analíticos (tendencias, KPIs) | Amazon QuickSight conectado a Aurora |
| Exportación | Generación de Excel/PDF en Lambda (librería exceljs/pdfkit) |
| Reportes programados | EventBridge + Lambda + SES para envío automático |

---

## 4. Plan de Migración Ampliado

### 4.1 Riesgos específicos de SQL Server 2008

| Riesgo | Mitigación |
|--------|-----------|
| Stored procedures con lógica de negocio | Reescribir en la capa de aplicación (NestJS), NO migrar a PL/pgSQL |
| Tipos de datos: `datetime` vs `timestamptz` | Script de conversión con manejo explícito de timezone (Chile/Continental) |
| Collation `SQL_Latin1_General_CP1_CI_AS` | Migrar a `es_CL.UTF-8` con validación de ordenamiento |
| Campos `ntext`/`image` (obsoletos) | Convertir a `text`/`bytea`, documentos grandes a S3 |
| Identity columns | Migrar a `GENERATED ALWAYS AS IDENTITY` en PostgreSQL |
| Triggers | Evaluar caso por caso: migrar a lógica de aplicación o event-driven |

### 4.2 Fases de migración detalladas

```
Fase 0: Assessment (2 semanas)
├── Inventario de objetos SQL Server (tablas, SPs, views, triggers, jobs)
├── Análisis de dependencias entre objetos
├── Volumetría actual y proyección de crecimiento
└── Identificación de datos sensibles (RUTs, datos personales)

Fase 1: Preparación (4 semanas)
├── Configurar Aurora PostgreSQL en sa-east-1
├── Ejecutar AWS SCT para conversión de esquema
├── Corregir manualmente objetos no convertibles
├── Crear scripts de validación (conteo de filas, checksums, integridad referencial)
└── Configurar AWS DMS con réplica de prueba

Fase 2: Migración paralela (4-6 semanas)
├── Full Load inicial con DMS
├── Activar CDC para sincronización continua
├── Ejecutar la nueva aplicación contra Aurora en modo lectura
├── Pruebas de regresión funcional (comparar resultados viejo vs nuevo)
└── Pruebas de carga con datos reales

Fase 3: Corte (1 fin de semana)
├── Viernes 18:00: Congelar escrituras en sistema antiguo
├── Viernes 20:00: DMS sincroniza últimos cambios
├── Viernes 22:00: Validación de integridad (scripts automatizados)
├── Sábado 08:00: Pruebas de humo en nuevo sistema
├── Sábado 14:00: Capacitación express a usuarios clave
├── Lunes 08:00: Go-live
└── Lunes-Viernes: Soporte intensivo post-migración

Plan de Rollback:
├── Aurora snapshot antes del corte
├── DNS switch-back a sistema antiguo (Route 53, TTL bajo)
├── Máximo 4 horas para decisión de rollback
└── Criterio: >5% de transacciones fallidas o pérdida de datos
```

---

## 5. Disaster Recovery y Alta Disponibilidad

### Elemento completamente ausente en la propuesta original

| Métrica | Objetivo |
|---------|---------|
| RPO (Recovery Point Objective) | < 5 minutos |
| RTO (Recovery Time Objective) | < 1 hora |
| Uptime SLA | 99.9% (8.7 horas de downtime máximo/año) |

### Estrategia

```
Región primaria: sa-east-1 (São Paulo)
├── Aurora PostgreSQL Multi-AZ (failover automático)
├── ECS Fargate multi-AZ (mínimo 2 tareas en zonas distintas)
├── S3 (replicación cross-region a us-east-1 para DR)
├── ElastiCache Redis Multi-AZ
└── ALB multi-zona

Backups:
├── Aurora: snapshots automáticos diarios, retención 30 días
├── Aurora: backtrack habilitado (point-in-time recovery)
├── S3: versionado + lifecycle policy
├── Infraestructura: IaC con Terraform/CDK (reconstrucción completa en <2 horas)
└── Secrets: AWS Secrets Manager con rotación automática
```

---

## 6. Seguridad y Cumplimiento

### 6.1 Protección de datos personales (Ley 19.628 y futura Ley de Datos Personales de Chile)

| Control | Implementación |
|---------|---------------|
| Cifrado en reposo | Aurora: KMS. S3: SSE-S3 o SSE-KMS |
| Cifrado en tránsito | TLS 1.3 obligatorio en ALB y entre servicios |
| Datos sensibles (RUT) | Cifrado a nivel de campo con KMS para campos PII |
| Auditoría de acceso | CloudTrail + logs de aplicación en CloudWatch |
| Control de acceso | RBAC en la aplicación, IAM policies por servicio |
| Protección de API | WAF en ALB/CloudFront, rate limiting, validación de input |
| Gestión de secretos | AWS Secrets Manager (no .env ni hardcoded) |

### 6.2 Matriz de roles (basada en el Anexo)

| Rol | Permisos |
|-----|---------|
| Administrador | CRUD total, configuración del sistema, cargas masivas, reportes |
| Supervisor | Lectura total, aprobación de comités, reportes, reasignación de atenciones |
| Abogado | CRUD de atenciones asignadas, registro de gestiones, consulta de afiliados |
| Operador (Call Center) | Crear consultas, buscar afiliados, derivar atenciones |
| Auditor | Solo lectura de logs, reportes, historial de cambios |

---

## 7. CI/CD y Ambientes

### Elemento completamente ausente en la propuesta original

```
Ambientes:
├── dev      (desarrollador local + Aurora dev)
├── staging  (réplica de producción, datos anonimizados)
└── prod     (sa-east-1, Multi-AZ)

Pipeline CI/CD (AWS CodePipeline o GitHub Actions):
├── Push a rama feature/* -> Build + unit tests + lint
├── PR a main -> Build + tests + SAST (SonarQube) + deploy a staging
├── Merge a main -> Deploy automático a staging, manual a prod
└── Tag release/v* -> Deploy a producción con aprobación manual

Infraestructura como Código:
├── AWS CDK (TypeScript) o Terraform
├── Todos los recursos definidos en código, versionados en Git
└── Ningún recurso creado manualmente en la consola AWS
```

---

## 8. Estimación de Costos Mensuales AWS

### Elemento completamente ausente en la propuesta original

| Servicio | Configuración | Costo estimado USD/mes |
|---------|--------------|----------------------|
| Aurora PostgreSQL | db.r6g.large Multi-AZ, 100GB | ~$450 |
| ECS Fargate | 2 tareas x 2vCPU/4GB | ~$150 |
| S3 | 500GB documentos + Intelligent-Tiering | ~$15 |
| ElastiCache Redis | cache.t4g.medium | ~$65 |
| CloudFront | 100GB transferencia | ~$10 |
| ALB | 1 balanceador + reglas | ~$25 |
| Lambda | Cargas masivas + notificaciones | ~$5 |
| SES | 10,000 emails/mes | ~$1 |
| CloudWatch | Logs + métricas | ~$30 |
| OpenSearch | t3.small.search | ~$50 |
| WAF | Reglas básicas | ~$10 |
| Secrets Manager | 10 secretos | ~$5 |
| **Total estimado** | | **~$816/mes** |

*Nota: Estos costos son estimaciones base. Reserved Instances pueden reducir Aurora y ElastiCache en ~40%. Los costos reales dependen del tráfico y volumen de datos.*

---

## 9. Cronograma de Alto Nivel

| Fase | Duración | Entregables |
|------|---------|------------|
| 1. Descubrimiento y diseño detallado | 4 semanas | Documento de diseño, modelo de datos, prototipos UI |
| 2. Infraestructura base | 2 semanas | IaC, ambientes, CI/CD, Aurora, ECS |
| 3. Módulo de Afiliados + Cargas Masivas | 4 semanas | CRUD afiliados, carga FLUJO/STOCK, validaciones |
| 4. Módulo de Atenciones (Consultas) | 4 semanas | Flujo completo de consultas, búsqueda, derivación |
| 5. Módulo de Asesorías + Comité | 6 semanas | Gestiones, comité, aprobaciones, notificaciones |
| 6. Módulo de Juicios + Comité | 6 semanas | Flujo judicial completo, plazos, alertas |
| 7. Facturación + WebPay | 4 semanas | Integración Transbank, facturación electrónica |
| 8. Reportería y Dashboards | 3 semanas | QuickSight, exportaciones, reportes automáticos |
| 9. Migración de datos | 6 semanas | Assessment, migración, validación, corte |
| 10. QA, capacitación y go-live | 4 semanas | Testing E2E, UAT, capacitación, soporte post-go-live |
| **Total estimado** | **~10-12 meses** | |

---

## 10. Diagrama de Arquitectura (Descripción textual)

```
                        ┌─────────────┐
                        │  Route 53   │
                        │   (DNS)     │
                        └──────┬──────┘
                               │
                        ┌──────┴──────┐
                        │ CloudFront  │
                        │   (CDN)     │
                        └──────┬──────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
             ┌──────┴──────┐    ┌────────┴────────┐
             │  S3 Bucket  │    │   ALB + WAF     │
             │  (Frontend) │    │ (Load Balancer) │
             └─────────────┘    └────────┬────────┘
                                         │
                              ┌──────────┴──────────┐
                              │   ECS Fargate        │
                              │   (NestJS App)       │
                              │                      │
                              │  ┌─────────────────┐ │
                              │  │ Módulos:         │ │
                              │  │ - Atenciones     │ │
                              │  │ - Afiliados      │ │
                              │  │ - Facturación    │ │
                              │  │ - Comité         │ │
                              │  │ - Reportes       │ │
                              │  │ - Cargas Masivas │ │
                              │  └─────────────────┘ │
                              └───┬──────┬──────┬────┘
                                  │      │      │
                    ┌─────────────┤      │      ├─────────────┐
                    │             │      │      │             │
             ┌──────┴──────┐ ┌───┴───┐  │  ┌───┴──────┐ ┌───┴────────┐
             │   Aurora    │ │ Redis │  │  │    S3    │ │ OpenSearch │
             │ PostgreSQL  │ │ Cache │  │  │  (Docs)  │ │  (Search)  │
             │  Multi-AZ   │ │       │  │  │          │ │            │
             └─────────────┘ └───────┘  │  └──────────┘ └────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │   EventBridge      │
                              │   + SQS + Lambda   │
                              │                    │
                              │  - Notificaciones  │
                              │  - Cargas masivas  │
                              │  - Emails (SES)    │
                              └────────────────────┘

Autenticación: Microsoft Entra ID (OIDC) ──> Angular (MSAL.js) ──> JWT validation en NestJS
Monitoreo: CloudWatch + X-Ray + CloudTrail
IaC: AWS CDK (TypeScript)
CI/CD: GitHub Actions -> ECR -> ECS
```
