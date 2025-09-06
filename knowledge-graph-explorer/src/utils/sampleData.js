const sampleData = {
  nodes: [
    // Education Layer
    {
      id: 'stanford-cs',
      label: 'Stanford CS',
      type: 'education',
      layer: 'education',
      size: 15,
      timespan: { start: 2015, end: 2019 },
      description: 'Computer Science degree at Stanford University. Focused on AI and machine learning.'
    },
    {
      id: 'mit-phd',
      label: 'MIT PhD',
      type: 'education',
      layer: 'education',
      size: 18,
      timespan: { start: 2019, end: 2023 },
      description: 'PhD in Artificial Intelligence at MIT. Thesis on neural network optimization.'
    },
    
    // Research Layer
    {
      id: 'neural-nets',
      label: 'Neural Networks',
      type: 'research',
      layer: 'research',
      size: 16,
      timespan: { start: 2018, end: null },
      description: 'Research focus on neural network architectures and optimization techniques.'
    },
    {
      id: 'nlp-research',
      label: 'NLP Research',
      type: 'research',
      layer: 'research',
      size: 14,
      timespan: { start: 2020, end: null },
      description: 'Natural language processing research, focusing on transformer models.'
    },
    {
      id: 'computer-vision',
      label: 'Computer Vision',
      type: 'research',
      layer: 'research',
      size: 13,
      timespan: { start: 2017, end: 2021 },
      description: 'Computer vision research during PhD, published 8 papers in top venues.'
    },
    
    // Industry Layer
    {
      id: 'google-intern',
      label: 'Google Intern',
      type: 'industry',
      layer: 'industry',
      size: 12,
      timespan: { start: 2018, end: 2018 },
      description: 'Summer internship at Google Brain, worked on TensorFlow optimization.'
    },
    {
      id: 'openai-researcher',
      label: 'OpenAI Researcher',
      type: 'industry',
      layer: 'industry',
      size: 17,
      timespan: { start: 2023, end: null },
      description: 'Research scientist at OpenAI, working on large language models.'
    },
    
    // Current Interests Layer
    {
      id: 'ai-safety',
      label: 'AI Safety',
      type: 'current',
      layer: 'current',
      size: 15,
      timespan: { start: 2022, end: null },
      description: 'Current research focus on AI alignment and safety mechanisms.'
    },
    {
      id: 'llm-interpretability',
      label: 'LLM Interpretability',
      type: 'current',
      layer: 'current',
      size: 14,
      timespan: { start: 2023, end: null },
      description: 'Understanding how large language models work internally.'
    },
    
    // Geographic Layer
    {
      id: 'bay-area',
      label: 'Bay Area',
      type: 'geographic',
      layer: 'geographic',
      size: 16,
      timespan: { start: 2015, end: null },
      description: 'Living and working in the San Francisco Bay Area.'
    },
    {
      id: 'boston',
      label: 'Boston',
      type: 'geographic',
      layer: 'geographic',
      size: 13,
      timespan: { start: 2019, end: 2023 },
      description: 'Boston area during PhD at MIT.'
    }
  ],
  
  links: [
    // Education connections
    { source: 'stanford-cs', target: 'neural-nets', strength: 0.8, description: 'ML courses sparked interest in neural networks' },
    { source: 'stanford-cs', target: 'google-intern', strength: 0.6, description: 'Stanford connection helped land Google internship' },
    { source: 'mit-phd', target: 'nlp-research', strength: 0.9, description: 'PhD thesis focused on NLP applications' },
    { source: 'mit-phd', target: 'computer-vision', strength: 0.7, description: 'Side research during PhD' },
    
    // Research connections
    { source: 'neural-nets', target: 'nlp-research', strength: 0.8, description: 'Neural networks applied to NLP' },
    { source: 'neural-nets', target: 'computer-vision', strength: 0.7, description: 'CNNs for vision tasks' },
    { source: 'nlp-research', target: 'llm-interpretability', strength: 0.9, description: 'Current focus evolved from NLP research' },
    
    // Industry connections
    { source: 'google-intern', target: 'neural-nets', strength: 0.7, description: 'Applied neural network research at Google' },
    { source: 'openai-researcher', target: 'ai-safety', strength: 0.9, description: 'AI safety is core mission at OpenAI' },
    { source: 'openai-researcher', target: 'llm-interpretability', strength: 0.8, description: 'Daily work involves LLM research' },
    
    // Cross-layer connections
    { source: 'mit-phd', target: 'openai-researcher', strength: 0.6, description: 'PhD research led to OpenAI position' },
    { source: 'computer-vision', target: 'ai-safety', strength: 0.5, description: 'Vision research informed safety concerns' },
    
    // Geographic connections
    { source: 'stanford-cs', target: 'bay-area', strength: 0.9, description: 'Moved to Bay Area for Stanford' },
    { source: 'mit-phd', target: 'boston', strength: 0.9, description: 'Moved to Boston for MIT' },
    { source: 'google-intern', target: 'bay-area', strength: 0.7, description: 'Internship in Bay Area' },
    { source: 'openai-researcher', target: 'bay-area', strength: 0.8, description: 'OpenAI office in San Francisco' }
  ],
  
  config: {
    layers: [
      { id: 'education', name: 'Education', color: '#4a90e2' },
      { id: 'research', name: 'Research', color: '#7ed321' },
      { id: 'industry', name: 'Industry Experience', color: '#f5a623' },
      { id: 'current', name: 'Current Interests', color: '#d0021b' },
      { id: 'geographic', name: 'Geographic Journey', color: '#9013fe' }
    ]
  }
};

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = sampleData;
}
if (typeof window !== 'undefined') {
  window.sampleData = sampleData;
}