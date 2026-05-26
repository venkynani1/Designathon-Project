// Provides core API infrastructure for http concerns.
const statusCodes = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  500: 'INTERNAL_SERVER_ERROR',
}

function getErrorCode(statusCode) {
  return statusCodes[statusCode] ?? 'API_ERROR'
}

export function sendError(response, statusCode, message, details) {
  const error = {
    code: getErrorCode(statusCode),
    message,
  }

  if (details?.length) {
    error.details = details
  }

  return response.status(statusCode).json({
    success: false,
    error,
  })
}

export function normalizeErrorResponses(_request, response, next) {
  const originalJson = response.json.bind(response)

  response.json = (body) => {
    if (response.statusCode >= 400 && body?.error) {
      if (typeof body.error === 'object' && body.error.message) {
        return originalJson({
          success: false,
          ...body,
        })
      }

      return originalJson({
        success: false,
        error: {
          code: body.code ?? getErrorCode(response.statusCode),
          message: String(body.error),
          ...(body.details ? { details: body.details } : {}),
        },
      })
    }

    return originalJson(body)
  }

  next()
}

export function notFoundHandler(_request, response) {
  return sendError(response, 404, 'Route not found.')
}

export function errorHandler(error, _request, response, _next) {
  console.error(error)
  return sendError(response, 500, 'Internal server error.')
}
