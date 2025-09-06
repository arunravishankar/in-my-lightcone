const fs = require('fs');
const path = require('path');

function buildDistribution() {
    console.log('Building Knowledge Graph Explorer...');
    
    try {
        // Read core library file
        const corePath = path.join(__dirname, 'src', 'core', 'KnowledgeGraphExplorer.js');
        const coreContent = fs.readFileSync(corePath, 'utf8');
        
        // Create dist directory if it doesn't exist
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir);
        }
        
        // For now, just copy the core file (will add minification later)
        const distPath = path.join(distDir, 'knowledge-graph.js');
        fs.writeFileSync(distPath, coreContent);
        
        console.log('✅ Build complete!');
        console.log(`📦 Distribution file: ${distPath}`);
        
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

buildDistribution();