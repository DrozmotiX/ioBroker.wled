# Deployment Setup Guide

This document explains how to set up automated deployment for the ioBroker.wled adapter.

## Overview

The adapter uses GitHub Actions to automatically publish new releases to npm when a version tag is pushed. This requires proper authentication with npm.

## Problem

The deployment workflow failed with the error:
```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
npm error need auth You need to authorize this machine using `npm adduser`
```

## Root Cause

The workflow attempted to use NPM's "trusted publishing" (provenance) feature, but this was not configured on npmjs.com for the repository.

## Solution

There are two ways to fix this issue:

### Option 1: Configure NPM Token (Recommended)

This is the simpler option and works immediately.

1. **Create NPM Access Token**
   - Go to https://www.npmjs.com
   - Log in with the account that has publishing rights to `iobroker.wled`
   - Navigate to Account Settings → Access Tokens
   - Click "Generate New Token"
   - Select "Automation" as the token type
   - Name it something like "GitHub Actions - ioBroker.wled"
   - Copy the generated token

2. **Add Token to GitHub Secrets**
   - Go to https://github.com/DrozmotiX/ioBroker.wled/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste the token from step 1
   - Click "Add secret"

3. **Verify Configuration**
   - The workflow file (`.github/workflows/test-and-release.yml`) has been updated to use `npm-token: ${{ secrets.NPM_TOKEN }}`
   - Next time a version tag is pushed, deployment should succeed

### Option 2: Configure Trusted Publishing (Advanced)

This is NPM's recommended approach but requires more setup.

1. **Configure on npmjs.com**
   - Follow the official guide: https://docs.npmjs.com/trusted-publishers#configuring-trusted-publishing
   - Configure for GitHub repository: `DrozmotiX/ioBroker.wled`
   - Workflow file: `.github/workflows/test-and-release.yml`
   - Job name: `deploy`

2. **Update Workflow**
   - Remove the `npm-token` line from the workflow:
     ```yaml
     - uses: ioBroker/testing-action-deploy@v1
       with:
         node-version: '20.x'
         # DO NOT include npm-token when using trusted publishing
         github-token: ${{ secrets.GITHUB_TOKEN }}
     ```

3. **Verify Permissions**
   - Ensure the deploy job has these permissions:
     ```yaml
     permissions:
       contents: write
       id-token: write
     ```

## Testing the Fix

After implementing either solution:

1. Test with a pre-release version first (e.g., `v0.9.1-beta.0`)
2. Create and push a tag:
   ```bash
   git tag v0.9.1-beta.0
   git push origin v0.9.1-beta.0
   ```
3. Monitor the GitHub Actions workflow at: https://github.com/DrozmotiX/ioBroker.wled/actions
4. If successful, the package should appear on npm: https://www.npmjs.com/package/iobroker.wled

## Additional Notes

- **Token Expiry**: NPM Automation tokens do not expire, but can be revoked manually
- **Security**: Never commit tokens to the repository; always use GitHub Secrets
- **Sentry**: The workflow also requires `SENTRY_AUTH_TOKEN` to be configured for Sentry integration to work
- **Permissions**: Only repository administrators can add GitHub Secrets

## Current Workflow Configuration

The workflow has been updated to use the NPM token approach (Option 1). To use this:

1. Follow steps in "Option 1: Configure NPM Token" above
2. The workflow is ready to use once the `NPM_TOKEN` secret is added

## References

- [ioBroker Testing Action Deploy](https://github.com/ioBroker/testing-action-deploy)
- [NPM Access Tokens](https://docs.npmjs.com/about-access-tokens)
- [NPM Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
