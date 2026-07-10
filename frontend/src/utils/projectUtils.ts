import { Project } from "@/types";

export type ProjectType = 'solar' | 'wind' | 'pss' | 'other';

/**
 * Detects the project type based on explicit property, EPS name, or Project Name keywords.
 */
export const detectProjectType = (project: any, projectName?: string): ProjectType => {
  // If no project object, try to detect solely from the provided projectName string
  if (!project) {
    const nameStr = (projectName || '').toString().toLowerCase();
    
    // Explicit solar keywords override
    if (nameStr.includes('solar') || nameStr.includes('hsat')) return 'solar';
    
    const windKeywords = [
      'wind', 'mandvi', 'mundra', 
      'ahej5l', 'age25cl', 'age26al', 
      'are3l', 'asej6pl'
    ];
    if (windKeywords.some(keyword => nameStr.includes(keyword))) {
      return 'wind';
    }
    if (nameStr.includes('pss')) return 'pss';
    
    return 'solar';
  }

  // 1. Prioritize explicit projectType prop from backend (stored in DB)
  const rawType = project.projectType || project.project_type || project.ProjectType || project.Type;
  const ptProp = (rawType || '').toString().toLowerCase();
  
  // Debug log
  if (rawType) {
    console.log(`Detecting type for ${project.name || project.Name || projectName}: raw='${rawType}', result='${ptProp}'`);
  }

  if (ptProp === 'wind' || ptProp === 'pss' || ptProp === 'solar') {
    return ptProp as ProjectType;
  }

  // 2. Fallback to EPS name detection
  const eps = (project.parentEps || project.parent_eps || '').toString().toLowerCase();
  if (eps.includes('wind')) return 'wind';
  if (eps.includes('pss')) return 'pss';

  // 3. Fallback to Project Name keyword detection
  const name = (project.name || project.Name || projectName || '').toString().toLowerCase();
  
  // Explicit solar keywords override
  if (name.includes('solar') || name.includes('hsat')) {
    return 'solar';
  }

  const windKeywords = [
    'wind', 'mandvi', 'mundra', 
    'ahej5l', 'age25cl', 'age26al', 
    'are3l', 'asej6pl'
  ];

  if (windKeywords.some(keyword => name.includes(keyword))) {
    return 'wind';
  }
  if (name.includes('pss')) return 'pss';

  return 'solar'; // Default
};
