import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { seededInitialNodes, initialEdges } from '../data/initialGraph.js';

// Create the context
const ProjectContext = createContext(null);

// Local storage key
const PROJECTS_STORAGE_KEY = 'ai-node-generator-projects';

// Provider component
export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load projects from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setProjects(parsed.projects || []);
        setCurrentProjectId(parsed.currentProjectId || null);
      } catch (err) {
        console.error('Failed to load projects from localStorage:', err);
        setProjects([]);
        setCurrentProjectId(null);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify({
          projects,
          currentProjectId,
        })
      );
    }
  }, [projects, currentProjectId, isLoaded]);

  // Create a new project
  const createProject = useCallback((name) => {
    const projectId = `project-${Date.now()}`;
    const newProject = {
      id: projectId,
      name,
      nodes: JSON.parse(JSON.stringify(seededInitialNodes)),
      edges: JSON.parse(JSON.stringify(initialEdges)),
      lastSyncedNodes: JSON.parse(JSON.stringify(seededInitialNodes)),
      lastSyncedEdges: JSON.parse(JSON.stringify(initialEdges)),
      lastSyncedAt: null,
      lastSyncedVersion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setProjects((prev) => [...prev, newProject]);
    setCurrentProjectId(projectId);
    return newProject;
  }, []);

  // Get current project
  const getCurrentProject = useCallback(() => {
    return projects.find((p) => p.id === currentProjectId) || null;
  }, [projects, currentProjectId]);

  // Select a project by ID
  const selectProject = useCallback((projectId) => {
    if (projects.some((p) => p.id === projectId)) {
      setCurrentProjectId(projectId);
    }
  }, [projects]);

  // Update current project's graph
  const updateCurrentProject = useCallback((nodes, edges) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === currentProjectId
          ? {
              ...p,
              nodes: JSON.parse(JSON.stringify(nodes)),
              edges: JSON.parse(JSON.stringify(edges)),
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
  }, [currentProjectId]);

  // Update current project's version control state
  const updateProjectVersionControl = useCallback(
    (lastSyncedNodes, lastSyncedEdges, lastSyncedAt, lastSyncedVersion) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === currentProjectId
            ? {
                ...p,
                lastSyncedNodes: JSON.parse(JSON.stringify(lastSyncedNodes)),
                lastSyncedEdges: JSON.parse(JSON.stringify(lastSyncedEdges)),
                lastSyncedAt,
                lastSyncedVersion,
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      );
    },
    [currentProjectId]
  );

  // Delete a project
  const deleteProject = useCallback((projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (currentProjectId === projectId) {
      setCurrentProjectId(projects.length > 1 ? projects[0].id : null);
    }
  }, [currentProjectId, projects]);

  const value = {
    projects,
    currentProjectId,
    createProject,
    getCurrentProject,
    selectProject,
    updateCurrentProject,
    updateProjectVersionControl,
    deleteProject,
    isLoaded,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

// Hook to use the context
export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
