export interface ApiResponse<T = any> {
  statusCode: number;
  intOpCode: number;
  data: T[];
}