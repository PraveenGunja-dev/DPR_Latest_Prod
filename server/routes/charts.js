// server/routes/charts.js
const express = require('express');
const router = express.Router();

// We'll pass the authenticateToken middleware from server.js when registering the routes
let authenticateToken;

// Function to set the middleware (called from server.js)
const setPool = (dbPool, authMiddleware) => {
  authenticateToken = authMiddleware;
};

// Helper function to ensure authenticateToken is available
const ensureAuth = (req, res, next) => {
  if (typeof authenticateToken === 'function') {
    return authenticateToken(req, res, next);
  }
  // If authenticateToken is not set yet, deny access
  return res.status(401).json({ message: 'Authentication middleware not initialized' });
};

// Mock data for charts
const mockPlannedVsActualData = [
  { name: 'Week 1', planned: 20, actual: 15 },
  { name: 'Week 2', planned: 40, actual: 35 },
  { name: 'Week 3', planned: 60, actual: 55 },
  { name: 'Week 4', planned: 80, actual: 75 },
  { name: 'Week 5', planned: 100, actual: 90 },
];

const mockCompletionDelayData = [
  { name: 'Activity A', completion: 85, delay: 2 },
  { name: 'Activity B', completion: 70, delay: 5 },
  { name: 'Activity C', completion: 90, delay: 1 },
  { name: 'Activity D', completion: 60, delay: 8 },
  { name: 'Activity E', completion: 75, delay: 4 },
];

const mockApprovalFlowData = [
  { name: 'Submitted', submitted: 45, approved: 38, rejected: 7 },
  { name: 'In Review', submitted: 30, approved: 25, rejected: 5 },
  { name: 'Pending', submitted: 25, approved: 20, rejected: 5 },
];

const mockSubmissionTrendsData = [
  { name: '2025-01-01', date: '2025-01-01', submissions: 12 },
  { name: '2025-01-08', date: '2025-01-08', submissions: 19 },
  { name: '2025-01-15', date: '2025-01-15', submissions: 15 },
  { name: '2025-01-22', date: '2025-01-22', submissions: 22 },
  { name: '2025-01-29', date: '2025-01-29', submissions: 18 },
];

const mockRejectionDistributionData = [
  { name: 'Quality Issues', value: 30 },
  { name: 'Documentation', value: 25 },
  { name: 'Design Changes', value: 20 },
  { name: 'Resource Constraints', value: 15 },
  { name: 'Other', value: 10 },
];

const mockBottleneckData = [
  { name: 'Vendor A', delay: 12 },
  { name: 'Vendor B', delay: 8 },
  { name: 'Vendor C', delay: 15 },
  { name: 'Vendor D', delay: 6 },
  { name: 'Vendor E', delay: 10 },
];

const mockHealthComparisonData = [
  { name: 'Project A', health: 85 },
  { name: 'Project B', health: 72 },
  { name: 'Project C', health: 90 },
  { name: 'Project D', health: 65 },
  { name: 'Project E', health: 78 },
];

const mockWorkflowScatterData = [
  { name: '2025-01-01', date: '2025-01-01', status: 'submitted', count: 12, role: 'Supervisor A', size: 12 },
  { name: '2025-01-01', date: '2025-01-01', status: 'approved', count: 8, role: 'Site PM', size: 8 },
  { name: '2025-01-02', date: '2025-01-02', status: 'rejected', count: 3, role: 'Site PM', size: 3 },
  { name: '2025-01-02', date: '2025-01-02', status: 'pushed', count: 5, role: 'PMAG', size: 5 },
  { name: '2025-01-03', date: '2025-01-03', status: 'submitted', count: 15, role: 'Supervisor B', size: 15 },
  { name: '2025-01-03', date: '2025-01-03', status: 'approved', count: 10, role: 'Site PM', size: 10 },
  { name: '2025-01-04', date: '2025-01-04', status: 'rejected', count: 2, role: 'Site PM', size: 2 },
  { name: '2025-01-04', date: '2025-01-04', status: 'pushed', count: 7, role: 'PMAG', size: 7 },
];

// Chart routes
router.get('/planned-vs-actual', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockPlannedVsActualData);
});

router.get('/completion-delay', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockCompletionDelayData);
});

router.get('/approval-flow', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockApprovalFlowData);
});

router.get('/submission-trends', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockSubmissionTrendsData);
});

router.get('/rejection-distribution', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockRejectionDistributionData);
});

router.get('/bottlenecks', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockBottleneckData);
});

router.get('/health-comparison', ensureAuth, (req, res) => {
  // This endpoint doesn't require projectId filtering
  res.json(mockHealthComparisonData);
});

router.get('/workflow-scatter', ensureAuth, (req, res) => {
  const { projectId } = req.query;
  // In a real implementation, you would filter data based on projectId
  res.json(mockWorkflowScatterData);
});

module.exports = { router, setPool };