import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as variables from "./variables";

// Define standard tags
const standard_tags = variables.default_tags;

// Use the existing VPC
const vpc = aws.ec2.getVpc({ default: true }).then(vpc => vpc);

// Retrieve subnet IDs from the VPC
const subnetIds = vpc.then(async vpc => {
    const subnets = await aws.ec2.getSubnets({ filters: [{ name: "vpc-id", values: [vpc.id] }] });
    return subnets.ids;
});

// retrieve the latest Amazon Linux AMI
const ami = aws.ec2.getAmi({
    filters: [{
        name: "name",
        "values": ["al2023-ami-*-kernel*x86_64*"]
    }],
    owners: ["amazon"],
    mostRecent: true,
});

// Create a security group for load balancer
const securityGroupLoadBalancer = vpc.then(vpc => new aws.ec2.SecurityGroup("load-balancer", {
    vpcId: vpc.id,
    tags: standard_tags
}));

// Add HTTPS ingress rule to the security group if DNS  is enabled
const httpsIngress = variables.create_dns_record ? securityGroupLoadBalancer.then(sg => new aws.ec2.SecurityGroupRule("https-ingress", {
    type: "ingress",
    fromPort: 443,
    toPort: 443,
    protocol: "tcp",
    cidrBlocks: ["0.0.0.0/0"],
    securityGroupId: pulumi.output(securityGroupLoadBalancer).apply(sg => sg.id),
})) : null;


// Add HTTP ingress rule to the security group if DNS is not enabled
const httpIngress = securityGroupLoadBalancer.then(sg => new aws.ec2.SecurityGroupRule("http-ingress", {
    type: "ingress",
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    cidrBlocks: ["0.0.0.0/0"],
    securityGroupId: pulumi.output(sg).apply(sg => sg.id),
}));

const egressRuleLoadBalancer = securityGroupLoadBalancer.then(sg => new aws.ec2.SecurityGroupRule("egress-lb", egressRule));

const egressRule: aws.ec2.SecurityGroupRuleArgs = {
    type: "egress",
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
    securityGroupId: pulumi.output(securityGroupLoadBalancer).apply(sg => sg.id),
};


// Create a security group for the EC2 instances
const securityGroupEC2 = vpc.then(vpc => new aws.ec2.SecurityGroup("ec2", {
    vpcId: vpc.id,
    tags: standard_tags
}));

// Add HTTP ingress rule to the security group
const httpIngressEC2 = securityGroupEC2.then(sg => new aws.ec2.SecurityGroupRule("http-ingress-ec2", {
    type: "ingress",
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    sourceSecurityGroupId: pulumi.output(securityGroupLoadBalancer).apply(sg => sg.id),
    securityGroupId: pulumi.output(securityGroupEC2).apply(sg => sg.id)
}));

// Add egress rule to the security group
const egressRuleEC2 = new aws.ec2.SecurityGroupRule("egress-ec2", {
    type: "egress",
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
    securityGroupId: pulumi.output(securityGroupEC2).apply(sg => sg.id)
});

// IAM role for the EC2 instances
const ec2Role = new aws.iam.Role("webserver-role", {
    assumeRolePolicy: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "ec2.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }),
    tags: standard_tags
});

// Attach the AmazonSSMManagedInstanceCore managed policy to the role
const managedPolicy = new aws.iam.RolePolicyAttachment("webserver-policy", {
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    role: ec2Role
});

// VPC Endpoint for SSM
const ssmVpcEndpoint = vpc.then(vpc => new aws.ec2.VpcEndpoint("ssm-endpoint", {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${variables.aws_region}.ssm`,
    vpcEndpointType: "Interface",
    securityGroupIds: pulumi.all([securityGroupEC2]).apply(([sg]) => [sg.id]),
    subnetIds: subnetIds
}));

// VPC Endpoint for EC2 messages
const ec2MessagesVpcEndpoint = vpc.then(vpc => new aws.ec2.VpcEndpoint("ec2-messages-endpoint", {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${variables.aws_region}.ec2messages`,
    vpcEndpointType: "Interface",
    securityGroupIds: pulumi.all([securityGroupEC2]).apply(([sg]) => [sg.id]),
    subnetIds: subnetIds
}));

// VPC Endpoint for SSM messages
const ssmMessagesVpcEndpoint = vpc.then(vpc => new aws.ec2.VpcEndpoint("ssm-messages-endpoint", {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${variables.aws_region}.ssmmessages`,
    vpcEndpointType: "Interface",
    securityGroupIds: pulumi.all([securityGroupEC2]).apply(([sg]) => [sg.id]),
    subnetIds: subnetIds
}));

// Instance profile for the EC2 instances
const instanceProfile = new aws.iam.InstanceProfile("webserver-profile", {
    role: ec2Role,
    tags: standard_tags
});

// Store user data script
const userDataScript = `#!/bin/bash
dnf update -y
dnf install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello World from $(hostname -f)</h1>" > /var/www/html/index.html`;


// Launch template
const launch_template = ami.then(ami => new aws.ec2.LaunchTemplate("launch-template", {
    imageId: ami.id,
    instanceType: variables.instance_type,
    userData: Buffer.from(userDataScript).toString('base64'),
    iamInstanceProfile: {
        name: instanceProfile.name
    },
    networkInterfaces: [{
        deviceIndex: 0,
        associatePublicIpAddress: "true",
        subnetId: subnetIds.then(ids => ids[0]),
        securityGroups: securityGroupEC2.then(sg => [sg.id])
    }],
    tags: standard_tags
}));

// Convert standard_tags dictionary to a list of dictionaries with propagate_at_launch key
const asgTags = Object.keys(standard_tags).map(key => {
    return {
        key: key,
        value: standard_tags[key as keyof typeof standard_tags],
        propagateAtLaunch: true
    }
});

// Auto Scaling Group
const asg = launch_template.then(lt => new aws.autoscaling.Group("webserver-asg", {
    vpcZoneIdentifiers: subnetIds,
    launchTemplate: {
        id: lt.id,
        version: "$Latest"
    },
    minSize: variables.ec2_config.min_size,
    maxSize: variables.ec2_config.max_size,
    desiredCapacity: variables.ec2_config.desired_capacity,
    healthCheckType: "EC2",
    tags: asgTags
}));

// Load Balancer
const loadBalancer = new aws.lb.LoadBalancer("webserver-lb", {
    securityGroups: pulumi.all([securityGroupLoadBalancer]).apply(([sg]) => [sg.id]),
    subnets: subnetIds,
    loadBalancerType: "application",
    tags: standard_tags
});

// Target Group
const targetGroup = new aws.lb.TargetGroup("webserver-tg", {
    port: 80,
    protocol: "HTTP",
    vpcId: vpc.then(vpc => vpc.id),
    tags: standard_tags
});

// TLS Certificate
const certificate = variables.create_dns_record ? new aws.acm.Certificate("certificate", {
    domainName: variables.dns_name,
    validationMethod: "DNS",
    tags: standard_tags
}) : null;

// Get route53 zone id from dns domain
const zone = variables.create_dns_record ? aws.route53.getZone({
    name: variables.dns_domain,
    privateZone: false
}) : null;

// Certificate Validation
const certificate_validation = variables.create_dns_record && certificate ?
    certificate.domainValidationOptions.apply(options => {
        if (options.length === 0) {
            throw new Error("No domain validation options available");
        }
        return new aws.route53.Record("certificate-validation", {
            name: options[0].resourceRecordName,
            type: options[0].resourceRecordType,
            zoneId: zone ? pulumi.output(zone).apply(zone => zone.zoneId) : "",
            records: [options[0].resourceRecordValue],
            ttl: 60
        });
    }) : null;

// Certificate Validation DNS Record
const certificate_validation_dns_record = variables.create_dns_record && certificate && certificate_validation ?
    new aws.acm.CertificateValidation("certificate-validation-dns-record", {
        certificateArn: certificate.arn,
        validationRecordFqdns: [certificate_validation.fqdn]
    }, {
        dependsOn: [certificate_validation]
    }) : null;


// HTTPS Listener with certificate
const httpsListener = variables.create_dns_record && certificate ? new aws.lb.Listener("https-listener", {
    loadBalancerArn: loadBalancer.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certificate.arn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn
    }]
}) : null;

// HTTP Listener
const httpListener = !variables.create_dns_record ? new aws.lb.Listener("http-listener", {
    loadBalancerArn: loadBalancer.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn
    }]
}) : null;

// HTTP Listener with Redirection to HTTPS
const httpRedirectListener = variables.create_dns_record && certificate ? new aws.lb.Listener("http-redirect-listener", {
    loadBalancerArn: loadBalancer.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "redirect",
        redirect: {
            protocol: "HTTPS",
            port: "443",
            statusCode: "HTTP_301"
        }
    }]
}) : null;

// Attach the ASG to the Load Balancer
const asg_attachment = asg.then(asg => new aws.autoscaling.Attachment("asg-attachment", {
    autoscalingGroupName: asg.name,
    lbTargetGroupArn: targetGroup.arn
}));

// Export the Load Balancer DNS name
export const loadBalancerDns = loadBalancer.dnsName;

// DNS Record
const dns_record = variables.create_dns_record ? new aws.route53.Record("dns-record", {
    name: variables.dns_name,
    type: "A",
    zoneId: zone ? pulumi.output(zone).apply(zone => zone.zoneId) : "",
    aliases: [{
        name: loadBalancer.dnsName,
        zoneId: loadBalancer.zoneId,
        evaluateTargetHealth: true
    }]
}) : null;

// Export the DNS Record
export const dnsRecord = variables.create_dns_record ? dns_record?.fqdn : null;

