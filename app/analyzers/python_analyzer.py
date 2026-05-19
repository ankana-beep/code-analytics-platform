"""
Python code analyzer using AST parsing.
Extracts metrics including complexity, docstrings, TODOs, and code quality indicators.
"""
import ast
import hashlib
import re
from typing import Dict, List, Optional, Set
from pathlib import Path
from radon.complexity import cc_visit
from radon.metrics import mi_visit

from app.domain.models import FileMetrics, FileType
from app.core.logging import logger
from app.analyzers.javascript_analyzer import JavaScriptAnalyzer
from app.analyzers.config_analyzer import ConfigAnalyzer


class PythonAnalyzer:
    """
    AST-based Python code analyzer.
    
    Extracts comprehensive metrics from Python source files including:
    - Lines of code, comments, docstrings
    - Cyclomatic and cognitive complexity
    - Function and class counts
    - TODO/FIXME markers
    - Import dependencies
    """
    
    def __init__(self):
        self.todo_pattern = re.compile(r'#\s*TODO:?\s*(.+)', re.IGNORECASE)
        self.fixme_pattern = re.compile(r'#\s*FIXME:?\s*(.+)', re.IGNORECASE)
    
    async def analyze_file(self, file_path: Path) -> Optional[FileMetrics]:
        """
        Analyze a single Python file.
        
        Args:
            file_path: Path to the Python file
            
        Returns:
            FileMetrics object or None if analysis fails
        """
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Calculate file hash
            file_hash = hashlib.sha256(content.encode()).hexdigest()
            
            # Parse AST
            try:
                tree = ast.parse(content)
            except SyntaxError as e:
                logger.warning(f"Syntax error in {file_path}: {str(e)}")
                return self._create_basic_metrics(file_path, content, file_hash)
            
            # Extract metrics
            metrics = FileMetrics(
                file_path=str(file_path),
                file_type=FileType.PYTHON,
                file_hash=file_hash,
                file_size=len(content)
            )
            
            # Line counts
            lines = content.split('\n')
            metrics.lines_of_code = self._count_loc(lines)
            metrics.comment_lines = self._count_comments(lines)
            metrics.blank_lines = self._count_blank_lines(lines)
            
            # Complexity metrics
            complexity_results = cc_visit(content)
            if complexity_results:
                metrics.cyclomatic_complexity = sum(item.complexity for item in complexity_results)
                metrics.cognitive_complexity = self._calculate_cognitive_complexity(tree)
            
            # Maintainability index
            try:
                mi_results = mi_visit(content, multi=False)
                if mi_results:
                    metrics.maintainability_index = float(mi_results)
            except:
                pass
            
            # AST-based metrics
            visitor = PythonASTVisitor()
            visitor.visit(tree)
            
            metrics.functions = visitor.function_count
            metrics.classes = visitor.class_count
            metrics.methods = visitor.method_count
            metrics.docstring_coverage = self._calculate_docstring_coverage(visitor)
            metrics.dependencies = visitor.imports
            
            # TODO/FIXME detection
            metrics.todo_count = len(self.todo_pattern.findall(content))
            metrics.fixme_count = len(self.fixme_pattern.findall(content))
            
            # Test detection
            metrics.has_tests = self._is_test_file(file_path)
            
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to analyze {file_path}: {str(e)}")
            return None
    
    def _create_basic_metrics(
        self,
        file_path: Path,
        content: str,
        file_hash: str
    ) -> FileMetrics:
        """Create basic metrics when AST parsing fails."""
        lines = content.split('\n')
        
        return FileMetrics(
            file_path=str(file_path),
            file_type=FileType.PYTHON,
            file_hash=file_hash,
            file_size=len(content),
            lines_of_code=self._count_loc(lines),
            comment_lines=self._count_comments(lines),
            blank_lines=self._count_blank_lines(lines)
        )
    
    def _count_loc(self, lines: List[str]) -> int:
        """Count lines of code (excluding comments and blank lines)."""
        loc = 0
        in_multiline_string = False
        
        for line in lines:
            stripped = line.strip()
            
            # Skip blank lines
            if not stripped:
                continue
            
            # Handle multiline strings
            if '"""' in stripped or "'''" in stripped:
                in_multiline_string = not in_multiline_string
                continue
            
            if in_multiline_string:
                continue
            
            # Skip comment lines
            if stripped.startswith('#'):
                continue
            
            loc += 1
        
        return loc
    
    def _count_comments(self, lines: List[str]) -> int:
        """Count comment lines."""
        count = 0
        in_docstring = False
        
        for line in lines:
            stripped = line.strip()
            
            # Multiline docstrings
            if '"""' in stripped or "'''" in stripped:
                in_docstring = not in_docstring
                count += 1
                continue
            
            if in_docstring:
                count += 1
                continue
            
            # Single line comments
            if stripped.startswith('#'):
                count += 1
        
        return count
    
    def _count_blank_lines(self, lines: List[str]) -> int:
        """Count blank lines."""
        return sum(1 for line in lines if not line.strip())
    
    def _calculate_cognitive_complexity(self, tree: ast.AST) -> int:
        """
        Calculate cognitive complexity (simplified version).
        Cognitive complexity measures how difficult code is to understand.
        """
        complexity = 0
        nesting_level = 0
        
        for node in ast.walk(tree):
            # Control flow structures increase complexity
            if isinstance(node, (ast.If, ast.While, ast.For, ast.ExceptHandler)):
                complexity += 1 + nesting_level
            
            # Logical operators increase complexity
            elif isinstance(node, ast.BoolOp):
                complexity += len(node.values) - 1
            
            # Track nesting level
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                nesting_level += 1
        
        return complexity
    
    def _calculate_docstring_coverage(self, visitor: 'PythonASTVisitor') -> float:
        """
        Calculate docstring coverage percentage.
        
        Args:
            visitor: AST visitor with collected information
            
        Returns:
            Percentage of functions/classes with docstrings (0-100)
        """
        total = visitor.function_count + visitor.class_count
        
        if total == 0:
            return 0.0
        
        documented = visitor.documented_functions + visitor.documented_classes
        return (documented / total) * 100.0
    
    def _is_test_file(self, file_path: Path) -> bool:
        """Check if file is a test file."""
        name = file_path.name.lower()
        parent = file_path.parent.name.lower()
        
        return (
            name.startswith('test_') or
            name.endswith('_test.py') or
            parent in ('tests', 'test')
        )


class PythonASTVisitor(ast.NodeVisitor):
    """
    AST visitor to collect Python code metrics.
    Walks the AST tree and collects statistics about functions, classes, imports, etc.
    """
    
    def __init__(self):
        self.function_count = 0
        self.class_count = 0
        self.method_count = 0
        self.documented_functions = 0
        self.documented_classes = 0
        self.imports: List[str] = []
        self._in_class = False
    
    def visit_FunctionDef(self, node: ast.FunctionDef):
        """Visit function definition."""
        if self._in_class:
            self.method_count += 1
        else:
            self.function_count += 1
        
        # Check for docstring
        if ast.get_docstring(node):
            self.documented_functions += 1
        
        self.generic_visit(node)
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        """Visit async function definition."""
        self.visit_FunctionDef(node)
    
    def visit_ClassDef(self, node: ast.ClassDef):
        """Visit class definition."""
        self.class_count += 1
        
        # Check for docstring
        if ast.get_docstring(node):
            self.documented_classes += 1
        
        # Track that we're inside a class
        old_in_class = self._in_class
        self._in_class = True
        self.generic_visit(node)
        self._in_class = old_in_class
    
    def visit_Import(self, node: ast.Import):
        """Visit import statement."""
        for alias in node.names:
            self.imports.append(alias.name.split('.')[0])
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node: ast.ImportFrom):
        """Visit from...import statement."""
        if node.module:
            self.imports.append(node.module.split('.')[0])
        self.generic_visit(node)


# Analyzer registry for plugin architecture
ANALYZERS = {
    '.py': PythonAnalyzer,
    '.js': JavaScriptAnalyzer,
    '.jsx': JavaScriptAnalyzer,
    '.ts': JavaScriptAnalyzer,
    '.tsx': JavaScriptAnalyzer,
    '.json': ConfigAnalyzer,
    '.yml': ConfigAnalyzer,
    '.yaml': ConfigAnalyzer,
    '.toml': ConfigAnalyzer,
    '.md': ConfigAnalyzer,
    '.lock': ConfigAnalyzer,
}

FILENAME_ANALYZERS = {
    'dockerfile': ConfigAnalyzer,
    'dockerfile.bun': ConfigAnalyzer,
    'makefile': ConfigAnalyzer,
}


def get_analyzer(file_extension: str):
    """
    Get analyzer for file extension.
    
    Args:
        file_extension: File extension (e.g., '.py')
        
    Returns:
        Analyzer class or None
    """
    return ANALYZERS.get(file_extension)


def get_analyzer_for_path(file_path: Path):
    """
    Get analyzer for a file path by exact filename or extension.

    Args:
        file_path: Path to analyze

    Returns:
        Analyzer class or None
    """
    return FILENAME_ANALYZERS.get(file_path.name.lower()) or ANALYZERS.get(file_path.suffix.lower())
