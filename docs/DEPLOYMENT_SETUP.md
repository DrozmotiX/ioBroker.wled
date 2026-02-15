# Deployment Setup Guide

This document explains the automated deployment setup for the ioBroker.wled adapter.

## Overview

The adapter uses GitHub Actions for automated deployment with **NPM Trusted Publishing**. When a version tag is pushed, the workflow automatically publishes the package to npm without requiring an npm token.

## Trusted Publishing Configuration

This repository is configured to use [NPM Trusted Publishing](https://docs.npmjs.com/trusted-publishers), which provides secure authentication via OpenID Connect (OIDC).

### Verifying Trusted Publishing Setup

The trusted publishing configuration on npmjs.com must match these exact values:

- **Package**: `iobroker.wled`
- **GitHub Repository**: `DrozmotiX/ioBroker.wled`
- **Workflow File**: `.github/workflows/test-and-release.yml`
- **Job Name**: `deploy`
- **Environment**: (leave empty/none)

### If Deployment Fails

If you see this error during deployment:
```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
```

This typically means one of the following:

1. **Trusted publishing configuration mismatch** on npmjs.com
   - Verify the configuration at: https://www.npmjs.com/package/iobroker.wled/access
   - Ensure workflow file name and job name match exactly
   - Workflow: `.github/workflows/test-and-release.yml`
   - Job: `deploy`

2. **npm version too old** (unlikely, but check logs)
   - Trusted publishing requires npm 9.8.0 or higher
   - The workflow installs the latest npm version automatically

3. **Missing permissions** in workflow
   - The deploy job must have `id-token: write` permission
   - This is already configured in the workflow

### Required Workflow Configuration

The workflow is correctly configured with:

```yaml
deploy:
  permissions:
    contents: write      # For creating GitHub releases
    id-token: write      # For NPM trusted publishing
  
  steps:
    - uses: ioBroker/testing-action-deploy@v1
      with:
        # NO npm-token parameter - using trusted publishing
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Testing the Configuration

To verify trusted publishing works:

1. **Test with a pre-release version**:
   ```bash
   git tag v0.9.1-beta.0
   git push origin v0.9.1-beta.0
   ```

2. **Monitor the workflow**:
   - Go to: https://github.com/DrozmotiX/ioBroker.wled/actions
   - Watch the "Test and Release" workflow
   - The deploy job should complete successfully

3. **Verify publication**:
   - Check https://www.npmjs.com/package/iobroker.wled
   - The new version should appear with "Published via GitHub Actions" badge

## Troubleshooting

### Re-configuring Trusted Publishing

If you need to reconfigure trusted publishing on npmjs.com:

1. Go to https://www.npmjs.com/package/iobroker.wled
2. Navigate to the "Publishing access" tab
3. Under "Automation tokens and granular access tokens", find the GitHub Actions entry
4. Verify or update the configuration to match:
   - Repository: `DrozmotiX/ioBroker.wled`
   - Workflow: `.github/workflows/test-and-release.yml`
   - Job: `deploy`

### Fallback to Token-Based Authentication

If trusted publishing continues to fail, you can fall back to traditional token authentication:

1. **Create NPM Access Token**:
   - Go to https://www.npmjs.com
   - Navigate to Account Settings → Access Tokens
   - Create an "Automation" token

2. **Add to GitHub Secrets**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add secret: `NPM_TOKEN` with the token value

3. **Update workflow**:
   ```yaml
   - uses: ioBroker/testing-action-deploy@v1
     with:
       npm-token: ${{ secrets.NPM_TOKEN }}  # Add this line
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

## Additional Notes

- **Security**: Trusted publishing is more secure than tokens as it uses short-lived credentials
- **Maintenance**: No token rotation needed with trusted publishing
- **Permissions**: Only repository administrators can modify workflow files
- **Sentry**: The workflow also integrates with Sentry for release tracking

## References

- [NPM Trusted Publishing Documentation](https://docs.npmjs.com/trusted-publishers)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [ioBroker Testing Action Deploy](https://github.com/ioBroker/testing-action-deploy)
- [GitHub Actions Permissions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions)

