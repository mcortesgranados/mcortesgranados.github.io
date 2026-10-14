import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { PrivateSubnet, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * One stack, three environments. Everything the service needs — network, compute,
 * data, alarms — is declared here, so a rebuild in another account or region
 * produces the same environment and no console change goes untracked.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { environment: 'dev' | 'staging' | 'prod' }) {
    super(scope, id, props);

    const { environment } = props;

    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: environment === 'prod' ? 3 : 1, // cost follows the environment tier
    });

    const database = new DatabaseInstance(this, 'Database', {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16 }),
      vpc,
      vpcSubnets: { subnets: vpc.selectSubnets({ subnetType: PrivateSubnet }) },
      multiAz: environment === 'prod',
      deletionProtection: environment === 'prod',
      backupRetention: Duration.days(environment === 'prod' ? 30 : 7),
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      instanceType: environment === 'prod' ? undefined : undefined,
    });

    const service = new ApplicationLoadBalancedFargateService(this, 'Api', {
      vpc,
      cpu: environment === 'prod' ? 1024 : 512,
      memoryLimitMiB: environment === 'prod' ? 2048 : 1024,
      desiredCount: environment === 'prod' ? 2 : 1,
      taskImageOptions: {
        image: undefined as never, // supplied by the pipeline with an immutable tag
        containerPort: 8080,
      },
      circuitBreaker: { rollback: true },
    });

    // Scaling policy and budget are declared next to the workload they protect.
    service.service.autoScaleTaskCount({ maxCapacity: environment === 'prod' ? 10 : 3 })
      .scaleOnCpuUtilization('CpuTarget', { targetUtilizationPercent: 65 });

    new Alarm(this, 'ApiP95Alarm', {
      metric: service.targetGroup.metrics.targetResponseTime({ statistic: 'p95' }),
      threshold: 500,
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new CfnOutput(this, 'ApiUrl', { value: service.loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.instanceEndpoint.socketAddress });
    new CfnOutput(this, 'ClusterName', { value: (service.service.cluster as ICluster).clusterName });
  }
}
