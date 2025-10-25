// Jest setup file for Lambda package tests
import { mockClient } from 'aws-sdk-client-mock';

// Global test setup
beforeEach(() => {
  // Reset all AWS SDK mocks before each test
  jest.clearAllMocks();
});

// Global test teardown
afterEach(() => {
  // Clean up any remaining mocks
  jest.restoreAllMocks();
});

// Configure Jest timeout for async operations
jest.setTimeout(10000);