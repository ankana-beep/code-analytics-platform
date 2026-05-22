export interface Scan {
  id: string;
  _id?: string;
  repository_path: string;
  branch: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  files_processed: number;
  files_total: number;
  current_file?: string;
  metrics?: ScanMetrics;
  repository_name?: string;
  health_score?: number;
  health_status?: 'Good' | 'Average' | 'Needs Improvement';
  issues?: ScanIssue[];
  dependency_summary?: DependencySummary;
  suggestions?: string[];
  production_later?: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface ScanIssue {
  type: string;
  severity: 'info' | 'warning' | 'error';
  file: string;
  line?: number | null;
  message: string;
}

export interface LargestFile {
  path: string;
  extension: string;
  size: number;
  total_lines: number;
  blank_lines: number;
  comment_lines: number;
  code_lines: number;
  todo_count: number;
  fixme_count: number;
  console_logs: number;
  debugger_statements: number;
  commented_out_code: number;
}

export interface DependencySummary {
  has_package_json: boolean;
  dependencies: string[];
  dev_dependencies: string[];
  total_dependencies: number;
  total_dev_dependencies: number;
  possibly_unused: string[];
  usage?: Record<string, number>;
}

export interface ScanStatus {
  scan_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  files_processed: number;
  files_total: number;
  current_file?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface GitHubRepository {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  description?: string;
  language?: string;
  updated_at?: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
}

export interface ScanMetrics {
  scan_id: string;
  repository_path: string;
  total_files: number;
  total_lines_of_code: number;
  total_comment_lines: number;
  total_blank_lines: number;
  total_size: number;
  total_folders?: number;
  total_lines?: number;
  blank_lines?: number;
  comment_lines?: number;
  code_lines?: number;
  largest_files?: LargestFile[];
  commented_out_code?: number;
  console_logs?: number;
  debugger_statements?: number;
  file_types: Record<string, number>;
  docstring_coverage: number;
  todo_count: number;
  fixme_count: number;
  complexity_metrics: ComplexityMetrics;
  test_metrics: TestMetrics;
  dependencies: Dependency[];
  duplicate_files: DuplicateFile[];
  folder_statistics: FolderStats[];
  unused_imports: number;
  unused_variables: number;
  scan_duration: number;
  created_at: string;
}

export interface ComplexityMetrics {
  avg_cyclomatic_complexity: number;
  max_cyclomatic_complexity: number;
  avg_cognitive_complexity: number;
  max_cognitive_complexity: number;
  avg_maintainability_index: number;
}

export interface TestMetrics {
  total_test_files: number;
  test_coverage_percentage: number;
  tests_per_module: number;
}

export interface Dependency {
  package_name: string;
  version?: string;
  usage_count: number;
  files: string[];
}

export interface DuplicateFile {
  file_hash: string;
  file_paths: string[];
  file_size: number;
}

export interface FolderStats {
  folder_path: string;
  total_files: number;
  total_lines: number;
  total_size: number;
  file_types: Record<string, number>;
  avg_complexity: number;
}

