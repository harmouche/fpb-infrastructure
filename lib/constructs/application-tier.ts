import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { getFrontendUserData, getBackendUserData } from '../user-data/application';

interface ApplicationTierProps {
  vpc: ec2.Vpc;
  mongoSecurityGroup: ec2.SecurityGroup;
}

export class ApplicationTierConstruct extends Construct {
  public readonly frontendInstance: ec2.Instance;
  public readonly backendInstance: ec2.Instance;
  public readonly frontendSecurityGroup: ec2.SecurityGroup;
  public readonly backendSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: ApplicationTierProps) {
    super(scope, id);

    // Get ECR repositories
    const frontendRepo = ecr.Repository.fromRepositoryName(
      this, 
      'GJFrontendRepo',
      'gj-frontend'
    );

    const backendRepo = ecr.Repository.fromRepositoryName(
      this, 
      'GJBackendRepo',
      'gj-backend'
    );

    // Create security groups
    this.frontendSecurityGroup = new ec2.SecurityGroup(this, 'FrontendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for frontend EC2',
      allowAllOutbound: true,
    });

    this.backendSecurityGroup = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for backend EC2',
      allowAllOutbound: true,
    });

    // Configure security group rules
    this.configureSecurityGroups(props.mongoSecurityGroup);

    // Create EC2 role
    const ec2Role = this.createEC2Role();

    // Create instances
    this.frontendInstance = this.createFrontendInstance(props.vpc, ec2Role, frontendRepo);
    this.backendInstance = this.createBackendInstance(props.vpc, ec2Role, backendRepo);
  }

  private configureSecurityGroups(mongoSecurityGroup: ec2.SecurityGroup) {
    // Frontend security group rules
    this.frontendSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from internet'
    );

    this.frontendSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access to frontend'
    );

    // Backend security group rules
    this.backendSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3001),
      'Allow backend API access'
    );

    this.backendSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access to backend'
    );

    // Allow backend to connect to MongoDB
    this.backendSecurityGroup.addEgressRule(
      mongoSecurityGroup,
      ec2.Port.tcp(27017),
      'Allow connection to MongoDB'
    );
  }

  private createEC2Role(): iam.Role {
    const role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // Add ECR permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: ['*']
    }));

    // Add SSM permissions
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    return role;
  }

  private createFrontendInstance(vpc: ec2.Vpc, role: iam.Role, repo: ecr.IRepository): ec2.Instance {
    const instance = new ec2.Instance(this, 'FrontendInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      userData: getFrontendUserData(repo),
      securityGroup: this.frontendSecurityGroup,
      role,
      keyName: 'gamejour-key-new',
      requireImdsv2: true
    });

    // Add logical ID to prevent replacement
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.overrideLogicalId('GameJourFrontendInstance');
    
    // Add retention policy
    cdk.Tags.of(instance).add('Name', 'GameJourFrontendInstance');
    instance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    return instance;
  }

  private createBackendInstance(vpc: ec2.Vpc, role: iam.Role, repo: ecr.IRepository): ec2.Instance {
    const instance = new ec2.Instance(this, 'BackendInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      userData: getBackendUserData(repo),
      securityGroup: this.backendSecurityGroup,
      role,
      keyName: 'gamejour-key-new',
      requireImdsv2: true
    });

    // Add logical ID to prevent replacement
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.overrideLogicalId('GameJourBackendInstance');
    
    // Add retention policy
    cdk.Tags.of(instance).add('Name', 'GameJourBackendInstance');
    instance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    return instance;
  }
} 