#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../src/network-stack";
import { DataStack } from "../src/data-stack";
import { EdgeStack } from "../src/edge-stack";
import { ComputeStack } from "../src/compute-stack";

const app = new cdk.App();

// Stage = dev | staging | prod (default dev). Cambiar con --context stage=prod.
const stage = (app.node.tryGetContext("stage") as string | undefined) ?? "dev";

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "sa-east-1",
};

const tags = {
  Project: "Legalmene",
  Stage: stage,
  ManagedBy: "CDK",
};

const network = new NetworkStack(app, `Legalmene-${stage}-Network`, { env, stage, tags });

const data = new DataStack(app, `Legalmene-${stage}-Data`, {
  env,
  stage,
  tags,
  vpc: network.vpc,
});

const edge = new EdgeStack(app, `Legalmene-${stage}-Edge`, { env, stage, tags });

new ComputeStack(app, `Legalmene-${stage}-Compute`, {
  env,
  stage,
  tags,
  vpc: network.vpc,
  databaseSecretArn: data.databaseSecretArn,
  databaseEndpoint: data.databaseEndpoint,
  databasePort: data.databasePort,
  documentsBucket: edge.documentsBucket,
});
