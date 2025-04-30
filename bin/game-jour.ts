#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GameJourStack } from '../lib/game-jour-stack';
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  const secretsManager = new SecretsManager({ region: 'us-east-1' });
  const accountSecret = await secretsManager.getSecretValue({ SecretId: 'aws-account-id' });
  const accountId = accountSecret.SecretString;

  const app = new cdk.App();
  new GameJourStack(app, 'GameJourStack', {
    env: {
      account: accountId,
      region: 'us-east-1'
    }
  });
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
