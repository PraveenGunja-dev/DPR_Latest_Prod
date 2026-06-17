import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FilterContextType {
  yearFilter: string;
  setYearFilter: (year: string) => void;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  universalFilter: string;
  setUniversalFilter: (filter: string, projectId?: string | number) => void;
  loadProjectFilter: (projectId: string | number) => void;
  activityDateFilter: string | null;
  setActivityDateFilter: (filter: string | null) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

import { useAuth } from './AuthContext';

export const FilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.ObjectId || (user as any)?.id || 'guest';

  // State keys scoped by user
  const YEAR_KEY = `filter_year_${userId}`;
  const TYPE_KEY = `filter_type_${userId}`;

  const [yearFilter, setYearState] = useState<string>(() => localStorage.getItem(YEAR_KEY) || 'ALL');
  const [typeFilter, setTypeState] = useState<string>(() => localStorage.getItem(TYPE_KEY) || 'ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [universalFilter, setUniversalFilterState] = useState<string>("CC");
  const [activityDateFilter, setActivityDateFilter] = useState<string | null>(null);

  // Sync state when user changes
  useEffect(() => {
    setYearState(localStorage.getItem(YEAR_KEY) || 'ALL');
    setTypeState(localStorage.getItem(TYPE_KEY) || 'ALL');
    setSearchTerm('');
    setActivityDateFilter(null);
  }, [userId]);

  const setYearFilter = React.useCallback((year: string) => {
    setYearState(year);
    localStorage.setItem(YEAR_KEY, year);
  }, [YEAR_KEY]);

  const setTypeFilter = React.useCallback((type: string) => {
    setTypeState(type);
    localStorage.setItem(TYPE_KEY, type);
  }, [TYPE_KEY]);

  const setUniversalFilter = React.useCallback((filter: string, projectId?: string | number) => {
    setUniversalFilterState(filter);
    if (projectId) {
      localStorage.setItem(`filter_universal_${userId}_${projectId}`, filter);
    }
  }, [userId]);

  // Helper to load project-specific universal filter
  const loadProjectFilter = React.useCallback((projectId: string | number) => {
    const saved = localStorage.getItem(`filter_universal_${userId}_${projectId}`);
    if (saved) {
      setUniversalFilterState(saved);
    } else {
      setUniversalFilterState("CC"); // Default
    }
  }, [userId]);

  return (
    <FilterContext.Provider value={{ 
      yearFilter, setYearFilter, 
      typeFilter, setTypeFilter,
      searchTerm, setSearchTerm,
      universalFilter, setUniversalFilter,
      loadProjectFilter,
      activityDateFilter, setActivityDateFilter
    }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
};
