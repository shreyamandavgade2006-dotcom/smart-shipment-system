export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res, next) {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('[error]', err.message);
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ message: details.join('; ') || 'Validation failed' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ message: `Duplicate value for ${field}` });
  }
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
}
