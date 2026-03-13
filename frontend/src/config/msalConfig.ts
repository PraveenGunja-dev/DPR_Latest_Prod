// MSAL (Microsoft Authentication Library) Configuration
// Azure AD SSO for Adani Flow
import { Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: '743487f7-7ec0-4c3b-ba83-793370bb133f',
    authority: 'https://login.microsoftonline.com/04c72f56-1848-46a2-8167-8e5d36510cbc',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false, // Set to true for IE11 support
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string) => {
        if (level === LogLevel.Error) {
          console.error('[MSAL]', message);
        }
      },
      logLevel: LogLevel.Error,
      piiLoggingEnabled: false,
    },
  },
};

// Scopes for login - requesting user profile and email
export const loginRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
};

// Scopes for Microsoft Graph API calls
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
};
