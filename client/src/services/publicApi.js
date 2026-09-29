import axios from 'axios';

/**
 * Unauthenticated Public API Client
 * 
 * Specifically decoupled from the authenticated apiClient in `useApi.js`.
 * This client contains NO 401 redirect interceptors, allowing public citizens,
 * market traders, consumers, and external verification agents to query certificate
 * validity and digital seals without being forced to log in.
 */
export const publicApiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Verify a certificate by its public reference number.
 * @param {string} certificateNo - The official certificate number (e.g. CERT-2026-APMC-PUNJAB-9901)
 * @returns {Promise<Object>} - Verification response including instrument specs, seal, and error curve data
 */
export const verifyCertificate = async (certificateNo, seal) => {
  if (!certificateNo) {
    throw new Error('Certificate reference number is required');
  }
  const response = await publicApiClient.get(`/reports/verify/${encodeURIComponent(certificateNo)}`, {
    params: seal ? { seal } : undefined,
  });
  return response.data;
};

/** A few recently sealed certificate numbers to try on the public portal. */
export const getSampleCertificates = async () => {
  const response = await publicApiClient.get('/reports/public/samples');
  return response.data?.data || [];
};

export default publicApiClient;
