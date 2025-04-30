import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { getMongoDbUserData } from '../user-data/mongodb';

interface MongoClusterProps {
  vpc: ec2.Vpc;
  region: string;
  account: string;
}

export class MongoClusterConstruct extends Construct {
  public readonly primary: ec2.Instance;
  public readonly secondary: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: MongoClusterProps) {
    super(scope, id);

    // Create security group
    this.securityGroup = new ec2.SecurityGroup(this, 'MongoDBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for MongoDB Replica Set',
      allowAllOutbound: true,
    });

    // Add security group rules
    this.configureSecurityGroupRules();

    // Create EC2 role
    const ec2Role = this.createEC2Role();

    // Create MongoDB instances
    this.primary = this.createMongoInstance('Primary', props, ec2Role, 'a');
    this.secondary = this.createMongoInstance('Secondary', props, ec2Role, 'b');
  }

  private configureSecurityGroupRules() {
    // Allow MongoDB port access within the security group
    this.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(27017),
      'Allow MongoDB access within replica set'
    );

    // Allow MongoDB replica set communication on specific ports
    this.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(27017),
      'Allow MongoDB primary-secondary communication'
    );

    // Allow heartbeat checks between replica set members
    this.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(27019),
      'Allow MongoDB heartbeat checks'
    );

    // Allow config server communication
    this.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(27018),
      'Allow MongoDB config server communication'
    );
  }

  private createEC2Role(): iam.Role {
    const role = new iam.Role(this, 'MongoDBEC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // Add SSM managed policy for instance management
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    // Add CloudWatch permissions for monitoring
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    return role;
  }

  private createMongoInstance(
    name: string,
    props: MongoClusterProps,
    role: iam.Role,
    az: string
  ): ec2.Instance {
    const instance = new ec2.Instance(this, `MongoDB${name}`, {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      userData: getMongoDbUserData(props.region),
      securityGroup: this.securityGroup,
      role: role,
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(20, {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          deleteOnTermination: false,
        })
      }],
      availabilityZone: `${props.region}${az}`,
      keyName: 'gamejour-key-new',
      requireImdsv2: true
    });

    // Add logical ID to prevent replacement
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.overrideLogicalId(`MongoDB${name}Instance`);
    
    // Add retention policy
    cdk.Tags.of(instance).add('Name', `MongoDB${name}Instance`);
    instance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    cdk.Tags.of(instance).add('Role', name === 'Primary' ? 'MongoDBPrimary' : 'MongoDBSecondary');
    
    return instance;
  }
} 