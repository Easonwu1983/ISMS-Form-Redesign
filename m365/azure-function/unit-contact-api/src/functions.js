const { app } = require('@azure/functions');
const { handleApply, handleHealth, handleLookup } = require('./handlers');

app.http('unitContactApply', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'unit-contact/apply',
  handler: handleApply
});

app.http('unitContactLookup', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'unit-contact/status',
  handler: handleLookup
});

app.http('unitContactHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'unit-contact/health',
  handler: handleHealth
});
