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
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
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

export interface FileMetric {
  file_path: string;
  file_type: string;
  file_hash: string;
  file_size: number;
  lines_of_code: number;
  comment_lines: number;
  blank_lines: number;
  cyclomatic_complexity: number;
  cognitive_complexity: number;
  maintainability_index: number;
  docstring_coverage: number;
  todo_count: number;
  fixme_count: number;
  has_tests: boolean;
  test_coverage?: number;
  dependencies: string[];
  functions: number;
  classes: number;
  methods: number;
  created_at: string;
}
