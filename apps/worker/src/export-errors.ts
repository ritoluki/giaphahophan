export class ExportProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ExportProcessingError";
  }
}
