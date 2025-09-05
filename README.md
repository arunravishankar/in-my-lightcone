# Quarto Blog Setup Guide

This README contains all the essential information for building and maintaining your Quarto blog.

## Basic Quarto Commands

```bash
# Render the entire site
quarto render

# Preview with live reload (great for development)
quarto preview

# Render a specific file
quarto render post.qmd

# Check your Quarto installation
quarto check

# Create a new project
quarto create project website myblog

# Clean build artifacts
quarto clean
```

## _quarto.yml Configuration

Your current configuration:

```yaml
project:
  type: website
  output-dir: docs  # Output goes to docs/ for GitHub Pages

website:
  title: "In My Lightcone"
  site-url: https://www.inmylightcone.com
  description: "Exploring ideas across past, present, and future lightcones"
  
  navbar:
    left:
      - text: "Home"
        file: index.qmd
      - text: "About" 
        file: about.qmd
      - text: "Blog"
        file: blog.qmd
      - text: "Ramblings"
        file: ramblings.qmd
      - text: "Resources"
        file: resources.qmd
    right:
      - icon: github
        href: https://github.com/arunravishankar
      - icon: linkedin
        href: https://www.linkedin.com/in/arunravishankar
      - icon: bluesky
        href: https://bsky.app/profile/arunravishankar.bsky.social

format:
  html:
    theme: cosmo
    css: styles.css
```

### Additional useful _quarto.yml options:

```yaml
website:
  # Add favicon
  favicon: favicon.ico
  
  # Google Analytics
  google-analytics: "G-XXXXXXXXXX"
  
  # Social media cards
  open-graph: true
  twitter-card: true
  
  # Search functionality
  search: 
    location: navbar
    type: overlay
  
  # Page footer
  page-footer:
    left: "© 2025 Arun Ravishankar"
    right: 
      - icon: github
        href: https://github.com/arunravishankar

# Global format options
format:
  html:
    theme: cosmo
    css: styles.css
    toc: true
    toc-location: right
    code-fold: show
    code-tools: true
    highlight-style: github
    mainfont: "Open Sans"
    
# Execution options
execute:
  freeze: auto  # Freeze computational output
```

## Creating Content

### File Structure

```
your-blog/
├── _quarto.yml
├── index.qmd
├── about.qmd
├── blog.qmd
├── posts/
│   ├── 2025-01-15-first-post/
│   │   ├── index.qmd
│   │   └── image.png
│   ├── 2025-01-20-notebook-post/
│   │   ├── index.ipynb
│   │   └── data.csv
│   └── _metadata.yml
├── ramblings/
│   ├── index.qmd
│   ├── _metadata.yml
│   └── individual-rambling.qmd
├── styles.css
└── images/
```

### Naming Conventions

**Blog posts:**
- Folders: `YYYY-MM-DD-post-title/`
- Files: `index.qmd` or `index.ipynb`
- Example: `posts/2025-01-15-optimal-play-intro/index.ipynb`

**Standalone pages:**
- Files: `page-name.qmd`
- Example: `about.qmd`, `resources.qmd`

### Blog Post Metadata (YAML Frontmatter)

#### For .qmd files:
```yaml
---
title: "Getting Started with Optimal Play in Games"
subtitle: "Understanding different game types and solution methods"
author: "Arun Ravishankar"
date: "2025-01-15"
date-modified: "2025-01-16"
categories: [games, strategy, learning, game-theory]
tags: [nash-equilibrium, mcts, reinforcement-learning]
description: "First steps into understanding optimal strategies across different game types"
image: "featured-image.png"
image-alt: "Game tree visualization"
draft: false
bibliography: references.bib
citation: true
code-fold: true
code-tools: true
toc: true
toc-depth: 3
number-sections: true
---
```

#### For .ipynb files:
Add as a **raw cell** at the top:
```yaml
---
title: "Jupyter Notebook Post"
date: "2025-01-15"
categories: [python, analysis]
format:
  html:
    code-fold: false
    code-tools: true
execute:
  warning: false
  message: false
---
```

### Content Features

#### LaTeX Math
```markdown
Inline math: $E = mc^2$

Display math:
$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

Aligned equations:
$$
\begin{align}
x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} \\
y &= mx + c
\end{align}
$$
```

#### Code Execution Options

**In .qmd files:**
```markdown
```{python}
#| echo: true        # Show code
#| eval: true        # Run code
#| output: true      # Show output
#| warning: false    # Hide warnings
#| message: false    # Hide messages
#| error: true       # Show errors
#| include: true     # Include in output
#| cache: true       # Cache results
#| freeze: true      # Freeze output
#| fig-cap: "My plot"
#| fig-alt: "Description"
#| label: fig-myplot

import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 4, 9])
plt.show()
```
```

**In .ipynb files:**
Add magic comments in code cells:
```python
#| echo: false
#| fig-cap: "Game theory payoff matrix"
#| label: fig-payoff

# Your Python code here
```

#### Cross-references
```markdown
See @fig-myplot for the visualization.
As shown in @eq-quadratic, the solution is...
Refer to @sec-introduction for background.
```

#### Figures and Images
```markdown
![Caption text](path/to/image.png){#fig-label fig-alt="Alt text" width=80%}

::: {#fig-comparison layout-ncol=2}
![Left plot](left.png){#fig-left}

![Right plot](right.png){#fig-right}

Comparison of two approaches
:::
```

#### Callout Boxes
```markdown
::: {.callout-note}
This is a note callout.
:::

::: {.callout-tip}
## Pro Tip
This is a tip with a custom title.
:::

::: {.callout-warning collapse="true"}
## Expandable Warning
This warning is collapsed by default.
:::
```

#### Citations and References
Create `references.bib`:
```bibtex
@article{nash1950,
  title={Equilibrium points in n-person games},
  author={Nash, John},
  journal={PNAS},
  year={1950}
}
```

In your post:
```markdown
According to @nash1950, equilibrium points exist...
```

#### Tabs and Columns
```markdown
::: {.panel-tabset}
## Python
```python
print("Hello world")
```

## R
```r
print("Hello world")
```
:::

::: {layout-ncol=2}
Content in left column

Content in right column
:::
```

## Categories and Tags

### Consistent Categories
Use these consistently across posts:
- `games` - Game theory and optimal play
- `economics` - Markets, auctions, pricing
- `ml` - Machine learning topics
- `experimentation` - A/B testing, Bayesian methods
- `ai` - LLMs, memory systems
- `learning` - Learning notes and documentation
- `tutorial` - How-to guides
- `analysis` - Data analysis posts

### In posts/_metadata.yml:
```yaml
# Shared metadata for all posts
author: "Arun Ravishankar"
citation: true
search: true
freeze: auto
```

## Publishing Workflow

### Local Development
```bash
# Start development server
quarto preview

# Make changes to files
# Browser auto-refreshes

# When ready to publish
quarto render
```

### GitHub Pages Deployment
1. Set `output-dir: docs` in `_quarto.yml`
2. Render locally: `quarto render`
3. Commit and push to GitHub:
```bash
git add .
git commit -m "Update blog post"
git push origin main
```
4. Enable GitHub Pages in repo settings (source: docs folder)

### GitHub Actions (Alternative)
Create `.github/workflows/quarto-publish.yml`:
```yaml
name: Render and Publish
on:
  push:
    branches: main
    
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
        
      - name: Set up Quarto
        uses: quarto-dev/quarto-actions/setup@v2
        
      - name: Render and Publish
        uses: quarto-dev/quarto-actions/publish@v2
        with:
          target: gh-pages
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Images and Media

### Organization
```
posts/
├── 2025-01-15-post-title/
│   ├── index.qmd
│   ├── featured-image.png
│   ├── figure-1.png
│   └── data.csv
```

### Image Optimization
- Use WebP format when possible
- Optimize file sizes
- Provide alt text for accessibility
- Use descriptive filenames

### Image Syntax
```markdown
# Simple image
![Alt text](image.png)

# With sizing and positioning
![Alt text](image.png){width=50% fig-align="center"}

# With caption and label
![Game theory matrix](matrix.png){#fig-matrix fig-cap="2x2 game payoff matrix"}
```

## Useful Tips

1. **Development workflow**: Use `quarto preview` for live editing
2. **Computational posts**: Use `freeze: auto` to cache expensive computations
3. **Draft posts**: Set `draft: true` in frontmatter
4. **Future posts**: Set future dates and they won't render until that date
5. **Backup**: Always commit notebooks with outputs for reproducibility
6. **Performance**: Use `echo: false` for posts where code isn't important

## Troubleshooting

- **Render fails**: Check YAML syntax with online validator
- **Images don't show**: Check file paths and case sensitivity
- **Code doesn't run**: Ensure all packages are installed
- **Site looks broken**: Clear browser cache or try incognito mode
- **GitHub Pages not updating**: Check Actions tab for build errors