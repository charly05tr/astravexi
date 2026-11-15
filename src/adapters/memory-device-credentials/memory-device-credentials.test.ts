import { deviceCredentialsContract } from '../device-credentials.contract';
import { createMemoryDeviceCredentials } from './index';

deviceCredentialsContract('memory', async () => createMemoryDeviceCredentials());
