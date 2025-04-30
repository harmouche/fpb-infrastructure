import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface LoadBalancerProps {
  vpc: ec2.Vpc;
  frontendInstance: ec2.Instance;
  backendInstance: ec2.Instance;
  region: string;
  account: string;
}

export class LoadBalancerConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: LoadBalancerProps) {
    super(scope, id);

    // Create security group for ALB
    this.securityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from internet'
    );

    // Create ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'GameJourALB', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: this.securityGroup
    });

    // Get certificate
    const certId = process.env.ACM_CERTIFICATE_ID || 'YOUR_DEFAULT_CERT_ID';
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      `arn:aws:acm:${props.region}:${props.account}:certificate/${certId}`
    );

    // Create target groups
    const frontendTargetGroup = new elbv2.ApplicationTargetGroup(this, 'FrontendTarget', {
      vpc: props.vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200'
      }
    });

    const backendTargetGroup = new elbv2.ApplicationTargetGroup(this, 'BackendTarget', {
      vpc: props.vpc,
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200'
      }
    });

    // Add targets
    frontendTargetGroup.addTarget(new targets.InstanceTarget(props.frontendInstance));
    backendTargetGroup.addTarget(new targets.InstanceTarget(props.backendInstance));

    // Create listener
    const listener = this.alb.addListener('HttpsListener', {
      port: 443,
      certificates: [certificate],
      protocol: elbv2.ApplicationProtocol.HTTPS,
      defaultAction: elbv2.ListenerAction.forward([frontendTargetGroup])
    });

    // Add API routing
    listener.addAction('/api/*', {
      action: elbv2.ListenerAction.forward([backendTargetGroup]),
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/*'])
      ]
    });
  }
} 