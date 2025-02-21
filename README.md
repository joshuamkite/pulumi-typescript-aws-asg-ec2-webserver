# Pulumi AWS Auto Scaling Group TypeScript

This is a TypeScript port of my [pulumi-aws-asg](https://github.com/joshuamkite/pulumi-aws-asg) Python project.

## Overview

This Pulumi project provisions an auto-scaling group of EC2 instances in AWS running a simple web server behind a load balancer. The instances are managed using AWS Systems Manager (SSM) without the need for SSH access or bastion hosts.

- [Pulumi AWS Auto Scaling Group TypeScript](#pulumi-aws-auto-scaling-group-typescript)
  - [Overview](#overview)
  - [Architecture](#architecture)
  - [Prerequisites](#prerequisites)
  - [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [S3 Backend Configuration](#s3-backend-configuration)
  - [Deployment](#deployment)
  - [Key Features](#key-features)
    - [SSM Access Without SSH](#ssm-access-without-ssh)
    - [VPC Endpoints](#vpc-endpoints)
    - [HTTPS Support](#https-support)
  - [Differences from Python Version](#differences-from-python-version)
- [Resources list](#resources-list)

## Architecture

The project creates the following resources:

- Auto Scaling Group with EC2 instances running Amazon Linux 2023
- Application Load Balancer
- Security Groups for EC2 instances and Load Balancer
- VPC Endpoints for SSM, EC2 Messages, and SSM Messages
- TLS Certificate (optional)
- Route53 DNS record (optional)

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [Node.js](https://nodejs.org/en/download/)
- [TypeScript](https://www.typescriptlang.org/download)
- AWS CLI configured with appropriate credentials
- An existing VPC to deploy resources into

## Configuration

Edit the `variables.ts` file to configure the deployment

## Environment Variables

When using an existing VPC, set the following environment variables:

```bash
export VPC_ID=vpc-xxxxxxxxxxxxxxxxx
export ROUTE53_ZONE_ID=ZXXXXXXXXXXXXXXXX  # Only needed if create_dns_record is true
```

## S3 Backend Configuration

Instead of using the Pulumi Cloud for state management, you can use an S3 bucket as a backend:

1. Add the following to your `Pulumi.yaml`:

```yaml
backend:
```yaml
backend:
    url: "s3://your-bucket-name/your-region/your-project-name?region=your-region"
```

2. Log out of Pulumi Cloud and log in to the S3 backend:

```bash
pulumi logout
pulumi login "s3://your-bucket-name/your-region/your-project-name?region=your-region"
```

Note: Make sure you have appropriate permissions to access the S3 bucket.

## Deployment

1. Install dependencies:

```bash
npm install
```

2. Preview the deployment:

```bash
pulumi preview
```

3. Deploy the stack:

```bash
pulumi up
```

4. When you're done, destroy the stack:

```bash
pulumi destroy
```

## Key Features

### SSM Access Without SSH

This project configures instances to be managed via AWS Systems Manager (SSM) Session Manager. No SSH keys or bastion hosts are required.

To connect to an instance:

```bash
aws ssm start-session --target i-xxxxxxxxxxxxxxxxx
```

### VPC Endpoints

The project creates VPC Endpoints for SSM, EC2 Messages, and SSM Messages to allow instances to communicate with AWS services without requiring internet access. This eliminates the need for NAT Gateways, reducing costs and improving security.

### HTTPS Support

When `create_dns_record` is set to `true`, the load balancer is configured with HTTPS support using an ACM certificate. HTTP requests are automatically redirected to HTTPS.

## Differences from Python Version

This TypeScript port follows the same architecture as the original Python project but leverages TypeScript-specific features of Pulumi:

- Uses async/await patterns with TypeScript promises
- Leverages TypeScript's static typing
- Follows TypeScript best practices for resource creation

# Resources list 

via `pulumi stack` from sample deployment

```bash
Current stack resources (26):
    TYPE                                                    NAME
    pulumi:pulumi:Stack                                     pulumi-ts-aws-asg-ec2-webserver-pulumi-ts-aws-asg-ec2-webserver
    ├─ aws:iam/role:Role                                    webserver-role
    ├─ aws:acm/certificate:Certificate                      certificate
    ├─ aws:iam/instanceProfile:InstanceProfile              webserver-profile
    ├─ aws:iam/rolePolicyAttachment:RolePolicyAttachment    webserver-policy
    ├─ aws:ec2/securityGroup:SecurityGroup                  load-balancer
    ├─ aws:ec2/securityGroup:SecurityGroup                  ec2
    ├─ aws:lb/targetGroup:TargetGroup                       webserver-tg
    ├─ aws:ec2/securityGroupRule:SecurityGroupRule          https-ingress
    ├─ aws:ec2/securityGroupRule:SecurityGroupRule          egress-lb
    ├─ aws:ec2/securityGroupRule:SecurityGroupRule          egress-ec2
    ├─ aws:ec2/securityGroupRule:SecurityGroupRule          http-ingress-ec2
    ├─ aws:ec2/vpcEndpoint:VpcEndpoint                      ec2-messages-endpoint
    ├─ aws:ec2/vpcEndpoint:VpcEndpoint                      ssm-endpoint
    ├─ aws:lb/loadBalancer:LoadBalancer                     webserver-lb
    ├─ aws:ec2/vpcEndpoint:VpcEndpoint                      ssm-messages-endpoint
    ├─ aws:ec2/launchTemplate:LaunchTemplate                launch-template
    ├─ aws:route53/record:Record                            certificate-validation
    ├─ aws:lb/listener:Listener                             https-listener
    ├─ aws:lb/listener:Listener                             http-redirect-listener
    ├─ aws:acm/certificateValidation:CertificateValidation  certificate-validation-dns-record
    ├─ aws:route53/record:Record                            dns-record
    ├─ aws:autoscaling/group:Group                          webserver-asg
    ├─ aws:autoscaling/attachment:Attachment                asg-attachment
    ├─ aws:ec2/securityGroupRule:SecurityGroupRule          http-ingress
    └─ pulumi:providers:aws                                 default_6_68_0

Current stack outputs (2):
    OUTPUT           VALUE
    dnsRecord        ec2-asg.pulumi.joshuakite.co.uk
    loadBalancerDns  webserver-lb-39d5f4e-443065510.eu-west-1.elb.amazonaws.com
```