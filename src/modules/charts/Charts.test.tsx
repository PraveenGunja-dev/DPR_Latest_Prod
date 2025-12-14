import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import { ChartsSection } from './ChartsSection';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLocation } from 'react-router-dom';

// Mock the hooks
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useLocation: vi.fn(),
}));

describe('ChartsSection', () => {
  beforeEach(() => {
    (useAuth as any).mockReturnValue({
      user: { Role: 'Site PM' },
    });
    
    (useLocation as any).mockReturnValue({
      state: { projectId: 1 },
    });
  });

  test('renders without crashing', () => {
    render(<ChartsSection />);
    // Since we're using mock data, we should see some chart elements
    expect(screen.getByText(/Planned vs Actual Progress/i)).toBeInTheDocument();
  });

  test('shows appropriate charts for Site PM role', () => {
    render(<ChartsSection />);
    
    // Site PM should see these charts
    expect(screen.getByText(/Planned vs Actual Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity Completion & Delay/i)).toBeInTheDocument();
    expect(screen.getByText(/Approval Flow Status/i)).toBeInTheDocument();
  });

  test('shows appropriate charts for PMAG role', () => {
    (useAuth as any).mockReturnValue({
      user: { Role: 'PMAG' },
    });
    
    render(<ChartsSection />);
    
    // PMAG should see these charts
    expect(screen.getByText(/Planned vs Actual Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity Completion & Delay/i)).toBeInTheDocument();
  });

  test('shows no charts for supervisor role', () => {
    (useAuth as any).mockReturnValue({
      user: { Role: 'supervisor' },
    });
    
    render(<ChartsSection />);
    
    // Supervisors should see no charts
    expect(screen.getByText(/No Charts Available/i)).toBeInTheDocument();
  });
});