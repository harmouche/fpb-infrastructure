import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface SecurityGroupsProps {
  vpc: ec2.Vpc;
}

export class SecurityGroups extends Construct {
  public readonly frontend: ec2.SecurityGroup;
  public readonly backend: ec2.SecurityGroup;
  public readonly mongodb: ec2.SecurityGroup;
  public readonly alb: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupsProps) {
    super(scope, id);

    this.frontend = new ec2.SecurityGroup(this, 'FrontendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for frontend EC2',
      allowAllOutbound: true,
    });

    this.backend = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for backend EC2',
      allowAllOutbound: true,
    });

    this.mongodb = new ec2.SecurityGroup(this, 'MongoDBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for MongoDB Replica Set',
      allowAllOutbound: true,
    });

    this.alb = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    });

    this.configureSecurityGroupRules();
  }

  private configureSecurityGroupRules() {
    // ALB rules
    this.alb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from internet'
    );

    // Frontend rules
    this.frontend.addIngressRule(
      this.alb,
      ec2.Port.tcp(80),
      'Allow ALB to frontend'
    );

    // Backend rules
    this.backend.addIngressRule(
      this.alb,
      ec2.Port.tcp(3001),
      'Allow ALB to backend'
    );

    // MongoDB rules
    this.mongodb.addIngressRule(
      this.backend,
      ec2.Port.tcp(27017),
      'Allow backend to MongoDB'
    );

    // SSH access
    [this.frontend, this.backend, this.mongodb].forEach(sg => {
      sg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(22),
        'Allow SSH access'
      );
    });

    // MongoDB replica set communication
    this.mongodb.addIngressRule(
      this.mongodb,
      ec2.Port.allTcp(),
      'Allow MongoDB replica set communication'
    );
  }
} 