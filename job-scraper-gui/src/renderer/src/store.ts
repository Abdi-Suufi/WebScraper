import { create } from 'zustand';
import type { AppSnapshot, Page } from '@shared/types';

interface UIState {
  snapshot: AppSnapshot | null;
  page: Page;
  activeSearchId: string;
  selectedJobId: string | null;
  loading: boolean;
  error: string | null;
  updateReady: boolean;
  setPage(page: Page): void;
  selectJob(id: string | null): void;
  setSnapshot(snapshot: AppSnapshot): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setUpdateReady(): void;
  clearUpdateReady(): void;
  setActiveSearch(id: string): void;
}

export const useAppStore = create<UIState>((set) => ({
  snapshot: null,
  page: 'jobs',
  activeSearchId: '',
  selectedJobId: null,
  loading: true,
  error: null,
  updateReady: false,
  setPage: (page) => set({ page }),
  selectJob: (selectedJobId) => set({ selectedJobId }),
  setSnapshot: (snapshot) => set((state) => ({
    snapshot,
    activeSearchId: state.activeSearchId || snapshot.savedSearches[0]?.id || '',
  })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setUpdateReady: () => set({ updateReady: true }),
  clearUpdateReady: () => set({ updateReady: false }),
  setActiveSearch: (activeSearchId) => set({ activeSearchId }),
}));
