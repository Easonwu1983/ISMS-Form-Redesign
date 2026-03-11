const {
  buildApplicationId,
  normalizeStoredApplication
} = require('./contract');

function getState() {
  if (!globalThis.__ISMS_UNIT_CONTACT_MOCK_STORE__) {
    globalThis.__ISMS_UNIT_CONTACT_MOCK_STORE__ = {
      applications: []
    };
  }
  return globalThis.__ISMS_UNIT_CONTACT_MOCK_STORE__;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseSequenceFromId(id, year) {
  const prefix = 'UCA-' + year + '-';
  if (!String(id || '').startsWith(prefix)) return 0;
  const raw = String(id).slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createMockStore() {
  return {
    async getNextSequence(year) {
      const applications = getState().applications;
      const max = applications.reduce((currentMax, entry) => {
        return Math.max(currentMax, parseSequenceFromId(entry.id, year));
      }, 0);
      return max + 1;
    },

    async createApplication(application) {
      const normalized = normalizeStoredApplication(application);
      getState().applications.push(normalized);
      return clone(normalized);
    },

    async listApplicationsByEmail(email) {
      return getState().applications
        .filter((entry) => entry.applicantEmail === email)
        .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))
        .map(clone);
    },

    async getHealth() {
      const applications = getState().applications;
      const latest = applications[applications.length - 1];
      return {
        mode: 'mock',
        applicationCount: applications.length,
        latestApplicationId: latest ? latest.id : '',
        sampleNextId: buildApplicationId(await this.getNextSequence(new Date().getFullYear()), new Date())
      };
    }
  };
}

module.exports = {
  createMockStore
};
