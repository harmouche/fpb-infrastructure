import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { SecurityGroups } from '../config/security-groups';

export class NetworkConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroups: SecurityGroups;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create VPC with standard configuration
    this.vpc = new ec2.Vpc(this, 'GameJourVPC', {
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr('10.1.0.0/16'),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ]
    });

    // Create security groups
    this.securityGroups = new SecurityGroups(this, 'SecurityGroups', {
      vpc: this.vpc
    });

    // Tag public subnets to indicate they need Internet Gateway
    this.vpc.publicSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add('aws-cdk:subnet-type', 'Public');
    });
  }
} 