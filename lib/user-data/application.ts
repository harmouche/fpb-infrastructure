import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export function getFrontendUserData(repo: ecr.IRepository): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  userData.addCommands(
    // Use Amazon Linux 2 package manager
    'yum update -y',
    'yum install -y amazon-linux-extras',
    
    // Install Docker
    'amazon-linux-extras enable docker',
    'yum install -y docker git',
    'systemctl enable docker',
    'systemctl start docker',
    'usermod -a -G docker ec2-user',
    
    // Install Nginx
    'amazon-linux-extras enable nginx1',
    'yum clean metadata',
    'yum install -y nginx',
    
    // Configure Nginx
    'echo "server { \
      listen 80; \
      location = / { \
        return 200 \"healthy\"; \
      } \
      location / { \
        proxy_pass http://localhost:3000; \
        proxy_set_header Host \$host; \
        proxy_set_header X-Real-IP \$remote_addr; \
      } \
    }" > /etc/nginx/conf.d/default.conf',
    'systemctl enable nginx',
    'systemctl start nginx',
    
    // Wait for Docker to be ready
    'timeout 60 bash -c "until docker info; do sleep 1; done"',
    
    // Login to ECR and pull image with retries
    'for i in {1..5}; do',
    '  aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ' + repo.repositoryUri,
    '  if [ $? -eq 0 ]; then',
    '    echo "Successfully logged into ECR"',
    '    break',
    '  fi',
    '  echo "Failed to login to ECR, attempt $i/5"',
    '  sleep 10',
    'done',
    
    // Pull and run container with retries
    'for i in {1..5}; do',
    '  docker pull ' + repo.repositoryUri + ':latest',
    '  if [ $? -eq 0 ]; then',
    '    echo "Successfully pulled image"',
    '    docker run -d \
      --name frontend \
      --restart unless-stopped \
      -p 3000:80 \
      ' + repo.repositoryUri + ':latest',
    '    break',
    '  fi',
    '  echo "Failed to pull image, attempt $i/5"',
    '  sleep 10',
    'done',
    
    // Install and start SSM agent
    'yum install -y amazon-ssm-agent',
    'systemctl enable amazon-ssm-agent',
    'systemctl start amazon-ssm-agent'
  );
  return userData;
}

export function getBackendUserData(repo: ecr.IRepository): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  userData.addCommands(
    // Use Amazon Linux 2 package manager
    'yum update -y',
    'yum install -y amazon-linux-extras',
    
    // Install Docker
    'amazon-linux-extras enable docker',
    'yum install -y docker git',
    'systemctl enable docker',
    'systemctl start docker',
    'usermod -a -G docker ec2-user',
    
    // Install Nginx
    'amazon-linux-extras enable nginx1',
    'yum clean metadata',
    'yum install -y nginx',
    
    // Configure Nginx
    'echo "server { \
      listen 3001; \
      location = /api/health { \
        return 200 \"healthy\"; \
      } \
      location / { \
        proxy_pass http://localhost:3001; \
        proxy_set_header Host \$host; \
        proxy_set_header X-Real-IP \$remote_addr; \
      } \
    }" > /etc/nginx/conf.d/default.conf',
    'systemctl enable nginx',
    'systemctl start nginx',
    
    // Wait for Docker to be ready
    'timeout 60 bash -c "until docker info; do sleep 1; done"',
    
    // Login to ECR and pull image with retries
    'for i in {1..5}; do',
    '  aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ' + repo.repositoryUri,
    '  if [ $? -eq 0 ]; then',
    '    echo "Successfully logged into ECR"',
    '    break',
    '  fi',
    '  echo "Failed to login to ECR, attempt $i/5"',
    '  sleep 10',
    'done',
    
    // Pull and run container with retries
    'for i in {1..5}; do',
    '  docker pull ' + repo.repositoryUri + ':latest',
    '  if [ $? -eq 0 ]; then',
    '    echo "Successfully pulled image"',
    '    docker run -d \
      --name backend \
      --restart unless-stopped \
      -p 3001:3001 \
      -e NODE_ENV=production \
      -e MONGODB_URI="mongodb://${mongoCluster.attrMongodbUri}" \
      -e JWT_SECRET="your-jwt-secret" \
      -e AWS_REGION="us-east-1" \
      -e AWS_S3_BUCKET_NAME="gj-logo" \
      -e STRIPE_SECRET_KEY="$(aws secretsmanager get-secret-value --secret-id game-jour/stripe-secret-key --query SecretString --output text)" \
      ' + repo.repositoryUri + ':latest',
    '    break',
    '  fi',
    '  echo "Failed to pull image, attempt $i/5"',
    '  sleep 10',
    'done',
    
    // Install and start SSM agent
    'yum install -y amazon-ssm-agent',
    'systemctl enable amazon-ssm-agent',
    'systemctl start amazon-ssm-agent'
  );
  return userData;
} 