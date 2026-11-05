# Third-Party Components and Licenses

ScholarLens original code is released under the MIT License. The following third-party components keep their own licenses.

## Runtime

### KaTeX

- Purpose: render LaTeX formulas in the translation panel
- Version: see `package.json`
- License: MIT
- Homepage: https://katex.org/
- Copyright: Copyright (c) 2013-2020 Khan Academy and other contributors
- Full license: `dist/licenses/KaTeX-LICENSE`

### mathml-to-latex

- Purpose: convert MathML formulas to LaTeX
- Version: see `package.json`
- License: MIT
- Homepage: https://github.com/asnunes/mathml-to-latex
- Copyright: Copyright (c) 2020 Alexandre Nunes
- Full license: `dist/licenses/mathml-to-latex-LICENSE.md`

### @xmldom/xmldom

- Purpose: XML parsing dependency of mathml-to-latex
- License: MIT
- Homepage: https://github.com/xmldom/xmldom
- Full license: `dist/licenses/xmldom-LICENSE`

### PDF.js

- Purpose: PDF rendering and text layer in the ScholarLens PDF reader
- Version: see `package.json`
- License: Apache-2.0
- Homepage: https://github.com/mozilla/pdf.js
- Copyright: Copyright 2012 Mozilla Foundation
- Full license: `dist/licenses/pdfjs-LICENSE`

## Build/development only

### esbuild

- Purpose: bundle JavaScript
- License: MIT
- Homepage: https://esbuild.github.io/

### fflate

- Purpose: create release archives
- License: MIT
- Homepage: https://github.com/101arrowz/fflate

## Fonts

KaTeX math fonts are distributed with KaTeX under the MIT License in `dist/vendor/fonts/`.
