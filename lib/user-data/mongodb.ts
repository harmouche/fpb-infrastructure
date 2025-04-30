import * as ec2 from 'aws-cdk-lib/aws-ec2';

export function getMongoDbUserData(region: string): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  
  userData.addCommands(
    'yum update -y',
    // Add MongoDB repo for Amazon Linux 2
    'echo "[mongodb-org-4.4]" > /etc/yum.repos.d/mongodb-org-4.4.repo',
    'echo "name=MongoDB Repository" >> /etc/yum.repos.d/mongodb-org-4.4.repo',
    'echo "baseurl=https://repo.mongodb.org/yum/amazon/2/mongodb-org/4.4/x86_64/" >> /etc/yum.repos.d/mongodb-org-4.4.repo',
    'echo "gpgcheck=1" >> /etc/yum.repos.d/mongodb-org-4.4.repo',
    'echo "enabled=1" >> /etc/yum.repos.d/mongodb-org-4.4.repo',
    'echo "gpgkey=https://www.mongodb.org/static/pgp/server-4.4.asc" >> /etc/yum.repos.d/mongodb-org-4.4.repo',
    
    // Install MongoDB and MongoDB Shell
    'yum install -y mongodb-org mongodb-org-shell',
    
    // Create MongoDB user and directories
    'useradd mongod || true',  // Add || true to prevent failure if user exists
    'mkdir -p /data/db /var/log/mongodb /var/run/mongodb',
    'chown -R mongod:mongod /data/db /var/log/mongodb /var/run/mongodb',
    
    // Configure MongoDB according to MongoDB docs
    'cat > /etc/mongod.conf << EOF',
    'systemLog:',
    '  destination: file',
    '  logAppend: true',
    '  path: /var/log/mongodb/mongod.log',
    '',
    'storage:',
    '  dbPath: /data/db',
    '',
    'net:',
    '  port: 27017',
    '  bindIp: 0.0.0.0',
    '',
    'replication:',
    '  replSetName: rs0',
    'EOF',
    
    // Start MongoDB using systemctl
    'systemctl enable mongod',
    'systemctl start mongod',

    // Wait for MongoDB to start and be ready - check log for "waiting for connections"
    'for i in {1..60}; do',
    '  if grep -q "waiting for connections" /var/log/mongodb/mongod.log; then',
    '    echo "MongoDB started successfully"',
    '    break',
    '  fi',
    '  echo "Waiting for MongoDB to start (attempt $i/60)"',
    '  sleep 5',
    'done',

    // Set AWS region for metadata queries
    'export AWS_DEFAULT_REGION=' + region,

    // Get instance role
    'INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)',
    'ROLE=$(aws ec2 describe-tags --filters "Name=resource-id,Values=$INSTANCE_ID" "Name=key,Values=Role" --query "Tags[0].Value" --output text)',
    
    // Use new approach with file-based initialization check
    'if [ "$ROLE" = "MongoDBPrimary" ] && [ ! -f /etc/mongodb-initialized ]; then',
    '  echo "MongoDB not yet initialized, proceeding with initialization..."',
    
    '  # Wait for DNS resolution before proceeding with initialization',
    '  for i in {1..30}; do',
    '    if dig primary.mongodb.internal +short && dig secondary.mongodb.internal +short; then',
    '      PRIMARY_IP=$(dig primary.mongodb.internal +short)',
    '      SECONDARY_IP=$(dig secondary.mongodb.internal +short)',
    '      echo "DNS resolution successful - Primary IP: $PRIMARY_IP, Secondary IP: $SECONDARY_IP"',
    '      break',
    '    fi',
    '    echo "Waiting for DNS resolution (attempt $i/30)"',
    '    sleep 10',
    '    if [ $i -eq 30 ]; then',
    '      echo "DNS resolution failed after 30 attempts"',
    '      exit 1',
    '    fi',
    '  done',
    
    '  # Initialize replica set with retries',
    '  for i in {1..30}; do',
    '    # Check if MongoDB is responding',
    '    if ! mongo --eval "db.adminCommand({ ping: 1 })" > /dev/null 2>&1; then',
    '      echo "MongoDB is not responding, waiting..."',
    '      sleep 10',
    '      continue',
    '    fi',
    
    '    # Check replica set status',
    '    RS_STATUS=$(mongo --quiet --eval "rs.status().ok || rs.status().code == 94" 2>/dev/null || echo "error")',
    '    if [ "$RS_STATUS" = "error" ]; then',
    '      echo "Error checking replica set status, retrying..."',
    '      sleep 10',
    '      continue',
    '    fi',
    
    '    # Initialize if not already initialized',
    '    if [ "$RS_STATUS" = "0" ] || [ "$RS_STATUS" = "1" ]; then',
    '      echo "Initializing replica set with permanent DNS names..."',
    '      INIT_RESULT=$(mongo --quiet --eval "rs.initiate({',
    '        _id: \"rs0\",',
    '        members: [',
    '          { _id: 0, host: \"primary.mongodb.internal:27017\", priority: 2 },',
    '          { _id: 1, host: \"secondary.mongodb.internal:27017\", priority: 1 }',
    '        ]',
    '      })" 2>&1)',
    '      if echo "$INIT_RESULT" | grep -q "ok" ; then',
    '        echo "Replica set initialized successfully"',
    '        break',
    '      else',
    '        echo "Failed to initialize replica set: $INIT_RESULT"',
    '      fi',
    '    else',
    '      echo "Replica set already initialized"',
    '      break',
    '    fi',
    '    echo "Waiting before retry (attempt $i/30)"',
    '    sleep 10',
    '  done',
    
    '  # Verify replica set configuration',
    '  echo "Verifying replica set configuration..."',
    '  mongo --eval "rs.conf()"',
    '  echo "Checking replica set status..."',
    '  mongo --eval "rs.status()"',
    
    '  # Create initialization marker file only if verification succeeds',
    '  if mongo --quiet --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then',
    '    touch /etc/mongodb-initialized',
    '    echo "Created initialization marker file"',
    '  else',
    '    echo "Failed to verify replica set status"',
    '    exit 1',
    '  fi',
    'else',
    '  if [ -f /etc/mongodb-initialized ]; then',
    '    echo "MongoDB already initialized (marker file exists)"',
    '  elif [ "$ROLE" != "MongoDBPrimary" ]; then',
    '    echo "This is not the primary node, skipping initialization"',
    '  fi',
    'fi',

    // Add logrotate configuration
    'cat > /etc/logrotate.d/mongodb << EOF',
    '/var/log/mongodb/mongod.log {',
    '    daily',
    '    size 100M',
    '    rotate 5',
    '    compress',
    '    delaycompress',
    '    notifempty',
    '    create 0600 mongod mongod',
    '    sharedscripts',
    '    postrotate',
    '        /bin/kill -SIGUSR1 \$(cat /var/run/mongodb/mongod.pid)',
    '    endscript',
    '}',
    'EOF',
    
    // Set correct MongoDB log verbosity
    'sed -i "s/verbosity: 2/verbosity: 0/" /etc/mongod.conf',

    // Store instance DNS in a file for easier troubleshooting
    'echo "Instance DNS: $(curl -s http://169.254.169.254/latest/meta-data/local-hostname)" > /home/ec2-user/instance-dns.txt',
    'chmod 644 /home/ec2-user/instance-dns.txt',

    // Ensure SSM Agent is installed and running
    'yum install -y amazon-ssm-agent',
    'systemctl enable amazon-ssm-agent',
    'systemctl start amazon-ssm-agent',
    'systemctl status amazon-ssm-agent'
  );

  return userData;
} 