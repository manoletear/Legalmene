# Legalmene Infra (AWS CDK)

CDK app que despliega la infra de LegalChile PSL en AWS.

## Stacks

| Stack | Recursos |
|---|---|
| `Legalmene-<stage>-Network` | VPC 3-AZ, NAT, subnets pública/privada/aislada, VPC endpoints (S3, ECR, Secrets, CW Logs) |
| `Legalmene-<stage>-Data` | Aurora PostgreSQL Serverless v2 Multi-AZ + KMS + Secrets Manager |
| `Legalmene-<stage>-Edge` | S3 documentos (versionado + tiering), S3 frontend, CloudFront + OAC |
| `Legalmene-<stage>-Compute` | ECR repo, ECS Fargate + ALB, WAF (managed rules + rate limit), CloudWatch Logs, auto-scaling |

Cada stack puede deployarse independientemente. Las dependencias entre stacks
se resuelven por referencias CDK (VPC, secret, endpoint, bucket).

## Stages

- `dev` (default): 1 NAT, 1 reader, instancias chicas, autodelete on
- `staging`: igual que dev pero con datos reales anonimizados
- `prod`: 3 NATs, 2 readers, retention 35 días, deletion protection on

Cambiar stage con `--context stage=prod` (ej. `pnpm synth --context stage=prod`).

## Comandos

```bash
pnpm install
pnpm build

export AWS_REGION=sa-east-1
export CDK_DEFAULT_REGION=sa-east-1
export CDK_DEFAULT_ACCOUNT=<account-id>

# Bootstrap (una vez por cuenta/region)
npx cdk bootstrap

# Synth (genera CloudFormation, no deploya)
pnpm synth

# Diff vs deployed
pnpm diff

# Deploy todos
pnpm deploy --context stage=dev

# Deploy específico
npx cdk deploy Legalmene-dev-Data
```

## Coste estimado (dev, sa-east-1)

- Aurora Serverless v2 (0.5-4 ACU): ~$70/mes idle, hasta ~$400 bajo carga
- Fargate (1 task 512/1024): ~$15/mes
- NAT Gateway: ~$32/mes
- ALB: ~$22/mes + tráfico
- S3 + CloudFront: ~$5-10/mes con 100GB
- CloudWatch + WAF: ~$15/mes
- **Total dev**: ~$160-180/mes idle

Producción multi-AZ con más capacidad: ~$800-1000/mes (alineado con
estimación de `docs/propuesta-arquitectura-legalchile.md` sección 8).

## Pendiente

- ElastiCache Redis (sesiones, caché de catálogo)
- OpenSearch (búsqueda full-text en documentos)
- SES domain identity + IAM para emails de notificación
- EventBridge + SQS para eventos async
- Route53 + ACM para dominio custom
- Pipeline CodePipeline o GitHub Actions OIDC role
