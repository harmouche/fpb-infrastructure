import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface DnsConstructProps {
  vpc: ec2.Vpc;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  mongoPrimary: ec2.Instance;
  mongoSecondary: ec2.Instance;
}

export class DnsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DnsConstructProps) {
    super(scope, id);

    // Create private DNS zone for MongoDB
    const mongoDbPrivateZone = new route53.PrivateHostedZone(this, 'MongoDbPrivateZone', {
      zoneName: 'mongodb.internal',
      vpc: props.vpc
    });

    // Create A records for MongoDB instances
    new route53.ARecord(this, 'MongoPrimaryDnsRecord', {
      zone: mongoDbPrivateZone,
      recordName: 'primary',
      target: route53.RecordTarget.fromIpAddresses(props.mongoPrimary.instancePrivateIp),
      ttl: cdk.Duration.minutes(1)
    });

    new route53.ARecord(this, 'MongoSecondaryDnsRecord', {
      zone: mongoDbPrivateZone,
      recordName: 'secondary',
      target: route53.RecordTarget.fromIpAddresses(props.mongoSecondary.instancePrivateIp),
      ttl: cdk.Duration.minutes(1)
    });

    // Get existing public hosted zone
    const publicZone = route53.HostedZone.fromLookup(this, 'GameJourHostedZone', {
      domainName: 'gamejour.com'
    });

    // Create API record with explicit ID preservation
    new route53.ARecord(this, 'ApiRecord', {
      zone: publicZone,
      recordName: 'api.gamejour.com',
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.loadBalancer)
      )
    });
  }
} 