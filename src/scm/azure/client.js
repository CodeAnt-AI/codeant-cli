import * as azdev from 'azure-devops-node-api';
import { getAzureDevOpsToken } from '../../utils/scmAuth.js';
import { getConfigValue } from '../../utils/config.js';

export function getConnection() {
  const token = getAzureDevOpsToken();
  if (!token) throw new Error('Azure DevOps token not found. Set AZURE_DEVOPS_TOKEN env var or run `codeant set-token azure <token>`.');

  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || getConfigValue('azureDevOpsOrgUrl');
  if (!orgUrl) throw new Error('Azure DevOps org URL not found. Set AZURE_DEVOPS_ORG_URL env var or run `codeant set-azure-org <url>`.');

  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  return new azdev.WebApi(orgUrl, authHandler);
}

// Azure repos use "project/repo" format
export function splitRepo(name) {
  const [project, repo] = name.split('/');
  if (!project || !repo) throw new Error(`Invalid repo name "${name}". Use project/repo format.`);
  return { project, repo };
}
