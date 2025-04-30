import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dotenv from 'dotenv';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NetworkConstruct } from './constructs/network';
import { MongoClusterConstruct } from './constructs/mongo-cluster';
import { ApplicationTierConstruct } from './constructs/application-tier';
import { LoadBalancerConstruct } from './constructs/load-balancer';
import { DnsConstruct } from './constructs/dns';
import { Construct } from 'constructs';

dotenv.config();

export class GameJourStack extends cdk.Stack {
  // Add public properties for all EC2 instances
  public readonly mongoPrimary: ec2.Instance;
  public readonly mongoSecondary: ec2.Instance;
  public readonly frontendInstance: ec2.Instance;
  public readonly backendInstance: ec2.Instance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing S3 bucket
    const teamLogosBucket = s3.Bucket.fromBucketName(this, 'TeamLogosBucket', 'gj-logo');

    // Create network infrastructure
    const network = new NetworkConstruct(this, 'Network');

    // Create MongoDB cluster
    const mongoCluster = new MongoClusterConstruct(this, 'MongoCluster', {
      vpc: network.vpc,
      region: this.region,
      account: this.account
    });

    // Create application tier
    const applicationTier = new ApplicationTierConstruct(this, 'ApplicationTier', {
      vpc: network.vpc,
      mongoSecurityGroup: mongoCluster.securityGroup
    });

    // Create load balancer
    const loadBalancer = new LoadBalancerConstruct(this, 'LoadBalancer', {
      vpc: network.vpc,
      frontendInstance: applicationTier.frontendInstance,
      backendInstance: applicationTier.backendInstance,
      region: this.region,
      account: this.account
    });

    // Create DNS records
    new DnsConstruct(this, 'DNS', {
      vpc: network.vpc,
      loadBalancer: loadBalancer.alb,
      mongoPrimary: mongoCluster.primary,
      mongoSecondary: mongoCluster.secondary
    });

    // Assign instances to class properties
    this.mongoPrimary = mongoCluster.primary;
    this.mongoSecondary = mongoCluster.secondary;
    this.frontendInstance = applicationTier.frontendInstance;
    this.backendInstance = applicationTier.backendInstance;

    // Create secret for Stripe key
    const stripeSecret = new secretsmanager.Secret(this, 'StripeSecret', {
      secretName: 'game-jour/stripe-secret-key',
      description: 'Stripe secret key for Game Jour application',
    });

    // Add permissions to read the secret
    const ec2Role = applicationTier.backendInstance.role as iam.Role;
    if (ec2Role) {
    ec2Role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
          'secretsmanager:GetSecretValue'
        ],
        resources: [stripeSecret.secretArn]
      }));
    }
  }
} 