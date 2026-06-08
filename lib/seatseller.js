/**
 * SeatSeller B2B Portal Integration Client (Offline/Structural Reference)
 * 
 * This module implements the B2B session replication, cookie jar persistence,
 * and automatic re-authentication logic for SeatSeller travel portals.
 */

const { prisma } = require('./db');
const { decrypt } = require('./crypto');

// Configuration for SeatSeller B2B
const SEATSELLER_CONFIG = {
  providerName: 'SeatSeller',
  portalUrl: 'https://in3.seatseller.travel',
  sessionTimeout: 15 * 60 * 1000 // 15 minutes session validity check
};

class SeatSellerClient {
  constructor() {
    this.portalUrl = SEATSELLER_CONFIG.portalUrl;
    this.sessionCookies = [];
    this.lastLoginTime = 0;
    this.loginPromise = null;
  }

  /**
   * Load credentials securely from the Credential Vault
   */
  async getCredentials() {
    const provider = await prisma.provider.findFirst({
      where: { providerName: SEATSELLER_CONFIG.providerName }
    });

    if (provider && provider.encryptedUsername && provider.encryptedPassword) {
      return {
        username: decrypt(provider.encryptedUsername),
        password: decrypt(provider.encryptedPassword),
        portalUrl: provider.portalUrl || this.portalUrl
      };
    }

    // Fallback to environment variables
    return {
      username: process.env.SEATSELLER_USERNAME,
      password: process.env.SEATSELLER_PASSWORD,
      portalUrl: process.env.SEATSELLER_PORTAL_URL || this.portalUrl
    };
  }

  /**
   * Automate portal authentication and extract secure session cookies
   */
  async login() {
    if (this.loginPromise) {
      console.log('[SeatSeller] Reusing login process in progress...');
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      // Start with a clean cookie slate
      this.sessionCookies = [];
      this.lastLoginTime = 0;

      const creds = await this.getCredentials();
      if (!creds.username || !creds.password) {
        throw new Error('SeatSeller credentials are not configured in environment or database.');
      }

      console.log('[SeatSeller] Initiating portal login sequence...');

      // 1. Fetch the main landing page to initialize session and extract baseline cookies
      const landingRes = await fetch(creds.portalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const landingCookies = this.extractSetCookies(landingRes.headers);

      // 2. Perform B2B signin / authenticate POST request
      // (Using typical endpoint URL structure. Replace URL/body keys based on actual browser capture logs)
      const authEndpoint = `${creds.portalUrl}/account/signin`;
      const bodyParams = new URLSearchParams();
      bodyParams.append('login', creds.username);
      bodyParams.append('password', creds.password);
      bodyParams.append('authenticity_token', ''); // Extract and include CSRF token if present in landing HTML

      const authRes = await fetch(authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': landingCookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `${creds.portalUrl}/`
        },
        body: bodyParams.toString(),
        redirect: 'manual'
      });

      const authCookies = this.extractSetCookies(authRes.headers);
      
      // Combine baseline cookies and authenticated cookies (filtering duplicates)
      const finalCookiesMap = new Map();
      [...landingCookies, ...authCookies].forEach(cookieStr => {
        const [nameValue] = cookieStr.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
          finalCookiesMap.set(name.trim(), value.trim());
        }
      });

      this.sessionCookies = Array.from(finalCookiesMap.entries()).map(([k, v]) => `${k}=${v}`);
      this.lastLoginTime = Date.now();
      console.log('[SeatSeller] Login completed successfully. Cookies loaded.');
      return true;
    })();

    try {
      return await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  /**
   * Helper to parse Set-Cookie headers from Response
   */
  extractSetCookies(headers) {
    const cookies = [];
    headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') {
        // Splitting cookie attributes (e.g. HttpOnly, Path) to store only key=value
        cookies.push(value.split(';')[0]);
      }
    });
    return cookies;
  }

  /**
   * Verify session status and perform auto-login if expired
   */
  async ensureSession() {
    const isExpired = (Date.now() - this.lastLoginTime) > SEATSELLER_CONFIG.sessionTimeout;
    if (this.sessionCookies.length === 0 || isExpired) {
      await this.login();
    }
  }

  /**
   * Generic authenticated fetch wrapper that injects active cookie jar
   */
  async authenticatedFetch(url, options = {}) {
    await this.ensureSession();

    if (!options.headers) options.headers = {};
    options.headers['Cookie'] = this.sessionCookies.join('; ');
    options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const response = await fetch(url, options);

    // If session expired / redirected, trigger re-login and retry request
    const text = await response.clone().text();
    const isLoginPageRedirect = response.status === 401 || 
                                response.status === 302 || 
                                text.includes('signin') || 
                                text.startsWith('<!DOCTYPE html');

    if (isLoginPageRedirect) {
      console.warn('[SeatSeller] Session expired during authenticated API call. Re-authenticating...');
      await this.login();
      return this.authenticatedFetch(url, options);
    }

    return response;
  }

  /**
   * GET User info from onboarding plan
   */
  async getCurrentUser() {
    const url = `${this.portalUrl}/rest-api/rest/v1/agentOnBoardingService/onBoardingPlan/currentUser`;
    const res = await this.authenticatedFetch(url);
    if (!res.ok) {
      throw new Error(`Failed to retrieve current user: Status ${res.status}`);
    }
    return await res.json();
  }

  /**
   * GET Wallet balance of B2B Agent
   */
  async getWalletBalance() {
    const url = `${this.portalUrl}/rest-api/rest/v1/agentBalanceService/balance`;
    const res = await this.authenticatedFetch(url);
    return await res.json();
  }

  /**
   * Search for buses/services
   */
  async searchBuses(fromId, toId, journeyDate) {
    const url = `${this.portalUrl}/rest-api/rest/v1/searchService/search?from=${fromId}&to=${toId}&date=${journeyDate}`;
    const res = await this.authenticatedFetch(url);
    return await res.json();
  }
}

module.exports = new SeatSellerClient();
