# LinkedIn API Setup Guide

## Current Status
LinkedIn's API has become increasingly restrictive. The platform currently supports:

### What Works (OpenID Connect)
- Basic profile info via `/v2/userinfo` endpoint
- Requires: `openid`, `profile`, `email` scopes

### What Requires Approval
Full LinkedIn API access (posts, connections, company data) requires:
1. LinkedIn Marketing Developer Platform membership
2. App review and approval (can take 2-4 weeks)
3. Specific use case justification

## How to Get Full API Access

1. Go to https://www.linkedin.com/developers/
2. Create an app or select existing app
3. Request access to Marketing Developer Platform
4. Complete the app review process
5. Once approved, update Nango integration with new scopes

## Nango Configuration
After approval, update the LinkedIn integration in Nango dashboard:
- Add scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`
- Update redirect URI if needed

## Data Available with Basic Access

With OpenID Connect userinfo endpoint, you get:
- `sub` - Unique LinkedIn member ID
- `name` - Full name
- `given_name` - First name
- `family_name` - Last name
- `email` - Email address (if email scope granted)
- `picture` - Profile picture URL (if available)

## Limitations

Without Marketing Developer Platform access:
- No access to posts or articles
- No access to connections
- No access to company pages
- No access to messaging
- Limited profile data
