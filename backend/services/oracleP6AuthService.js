// server/services/oracleP6AuthService.js
// Oracle P6 Authentication Service - Handles token generation and management
// REFACTORED: Now delegates to p6TokenService for dynamic OAuth token generation

const { getValidP6Token, clearCachedToken } = require('./p6TokenService');

class OracleP6AuthService {
  constructor() {
    this.baseUrl = process.env.ORACLE_P6_BASE_URL || 'https://sin1.p6.oraclecloud.com/adani/stage/p6ws';
  }

  /**
   * Get valid access token (from cache or generate new)
   * Delegates to p6TokenService
   * @returns {Promise<string>} Valid access token
   */
  async getValidToken() {
    return await getValidP6Token();
  }

  /**
   * Invalidate cached token (force refresh on next request)
   */
  invalidateToken() {
    console.log('Invalidating cached Oracle P6 token');
    clearCachedToken();
  }

  /**
   * Test token generation
   * @returns {Promise<boolean>} True if token generation successful
   */
  async testConnection() {
    try {
      const token = await this.getValidToken();
      console.log('Oracle P6 connection test successful');
      console.log('Token generated successfully');
      return true;
    } catch (error) {
      console.error('Oracle P6 connection test failed:', error.message);
      return false;
    }
  }

  // Deprecated method - kept for backward compatibility if needed
  async generateToken() {
    const token = await this.getValidToken();
    return {
      accessToken: token,
      expiresAt: Date.now() + 3600000, // Approximate
      expiresIn: 3600
    };
  }
}

// Export singleton instance
const authService = new OracleP6AuthService();

module.exports = {
  authService,
  OracleP6AuthService,
  generateToken: () => authService.generateToken(),
  getValidToken: () => authService.getValidToken(),
  invalidateToken: () => authService.invalidateToken(),
  testConnection: () => authService.testConnection()
};
