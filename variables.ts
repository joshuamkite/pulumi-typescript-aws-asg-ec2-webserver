// AWS configuration
export const aws_region = "eu-west-2"

// EC2 Configuration
export const instance_type = "t2.micro"

export const ec2_config = {
    "min_size": 1,
    "max_size": 3,
    "desired_capacity": 1
}

export const default_tags = {
    "project": "pulumi-aws-ec2-asg",
    "owner": "Joshua",
    "Name": "pulumi-aws-ec2-asg"
}

export const create_dns_record = true
export const dns_name = "ec2-asg.pulumi.joshuakite.co.uk" // Has to exist and be valid but won't really be used unless `create_dns_record`` is set to True


