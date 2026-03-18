(function () {
  window.createPolicyModule = function createPolicyModule(deps) {
    const {
      ROLES,
      STATUSES,
      TRAINING_STATUSES,
      TRAINING_UNDO_WINDOW_MINUTES,
      currentUser,
      getAuthorizedUnits,
      getReviewUnits,
      getActiveUnit,
      getAllItems,
      getAllChecklists,
      getAllTrainingForms,
      isChecklistDraftStatus,
      isReviewScopeEnforced
    } = deps;

    function isAdmin(user = currentUser()) {
      return user?.role === ROLES.ADMIN;
    }

    function isUnitAdmin(user = currentUser()) {
      return user?.role === ROLES.UNIT_ADMIN;
    }

    function isViewer(user = currentUser()) {
      return user?.role === ROLES.VIEWER;
    }

    function hasGlobalReadScope(user = currentUser()) {
      return !!user && (user.role === ROLES.ADMIN || user.role === ROLES.VIEWER);
    }

    function hasUnitAccess(unit, user = currentUser()) {
      if (!user) return false;
      const target = String(unit || '').trim();
      if (!target) return isAdmin(user);
      if (user.role === ROLES.ADMIN) return true;
      if (user.role === ROLES.VIEWER) {
        const scoped = getActiveUnit(user);
        return !!scoped && scoped === target;
      }
      return getAuthorizedUnits(user).includes(target);
    }

    function canCreateCAR(user = currentUser()) {
      return isAdmin(user);
    }

    function canReview(user = currentUser()) {
      if (isAdmin(user)) return true;
      if (!isUnitAdmin(user)) return false;
      if (!isReviewScopeEnforced()) return true;
      return getReviewUnits(user).length > 0;
    }

    function hasReviewScope(unit, user = currentUser()) {
      if (!user) return false;
      if (isAdmin(user)) return true;
      if (!isUnitAdmin(user)) return false;
      if (!isReviewScopeEnforced()) return true;
      const target = String(unit || '').trim();
      const reviewUnits = getReviewUnits(user);
      if (!target) return reviewUnits.length > 0;
      return reviewUnits.includes(target);
    }

    function canReviewItem(item, user = currentUser()) {
      if (!item || !user) return false;
      if (isAdmin(user)) return true;
      if (!isUnitAdmin(user)) return false;
      if (!isReviewScopeEnforced()) return true;
      return hasReviewScope(item.handlerUnit || item.proposerUnit || '', user);
    }

    function canFillChecklist(user = currentUser()) {
      return !!user && !isViewer(user);
    }

    function canFillTraining(user = currentUser()) {
      return !!user && !isViewer(user);
    }

    function canManageUsers(user = currentUser()) {
      return isAdmin(user);
    }

    function isItemHandler(item, user = currentUser()) {
      if (!item || !user) return false;
      return !!item.handlerUsername && item.handlerUsername === user.username;
    }

    function getVisibleItems(user = currentUser()) {
      if (!user) return [];
      const all = getAllItems();
      if (hasGlobalReadScope(user)) return all;
      return all.filter((item) => hasUnitAccess(item.handlerUnit, user) || isItemHandler(item, user));
    }

    function canAccessItem(item, user = currentUser()) {
      if (!item || !user) return false;
      if (hasGlobalReadScope(user)) return true;
      return hasUnitAccess(item.handlerUnit, user) || isItemHandler(item, user);
    }

    function canRespondItem(item, user = currentUser()) {
      if (!item || !user) return false;
      return item.status === STATUSES.PENDING && !isViewer(user) && (isItemHandler(item, user) || user.role === ROLES.ADMIN);
    }

    function canSubmitTracking(item, user = currentUser()) {
      if (!item || !user) return false;
      return item.status === STATUSES.TRACKING && !isViewer(user) && isItemHandler(item, user) && !item.pendingTracking;
    }

    function isChecklistOwner(item, user = currentUser()) {
      if (!user || !item) return false;
      return !!item.fillerUsername && item.fillerUsername === user.username;
    }

    function canAccessChecklist(item, user = currentUser()) {
      if (!user || !item) return false;
      if (hasGlobalReadScope(user)) return true;
      return hasUnitAccess(item.unit, user) || isChecklistOwner(item, user);
    }

    function getVisibleChecklists(user = currentUser()) {
      if (!user) return [];
      const all = getAllChecklists();
      if (hasGlobalReadScope(user)) return all;
      return all.filter((item) => canAccessChecklist(item, user));
    }

    function canEditChecklist(item, user = currentUser()) {
      if (!user || !item || !isChecklistDraftStatus(item.status) || !canFillChecklist(user)) return false;
      if (user.role === ROLES.ADMIN) return true;
      return hasUnitAccess(item.unit, user) || isChecklistOwner(item, user);
    }

    function getVisibleTrainingForms(user = currentUser()) {
      if (!user) return [];
      const forms = getAllTrainingForms();
      if (hasGlobalReadScope(user)) return forms;
      return forms.filter((form) => hasUnitAccess(form.unit, user) || form.fillerUsername === user.username);
    }

    function canEditTrainingForm(form, user = currentUser()) {
      if (!user || !form) return false;
      if (!(form.status === TRAINING_STATUSES.DRAFT || form.status === TRAINING_STATUSES.RETURNED)) return false;
      const inScope = user.role === ROLES.ADMIN || hasUnitAccess(form.unit, user) || form.fillerUsername === user.username;
      return inScope && !isViewer(user);
    }

    function canManageTrainingForm(form, user = currentUser()) {
      if (!user || !form || isViewer(user)) return false;
      return user.role === ROLES.ADMIN || form.fillerUsername === user.username;
    }

    function isTrainingManualRowOwner(row, user = currentUser()) {
      if (!row || !user || row.source !== 'manual') return false;
      const ownerUsername = String(row.createdByUsername || '').trim();
      const ownerName = String(row.createdBy || '').trim();
      return (!!ownerUsername && ownerUsername === user.username) || (!!ownerName && ownerName === user.name);
    }

    function canDeleteTrainingEditableRow(row, form, user = currentUser()) {
      if (!row || !user) return false;
      if (user.role === ROLES.ADMIN) return true;
      const editable = !form || canEditTrainingForm(form, user);
      return editable && isTrainingManualRowOwner(row, user);
    }

    function getTrainingUndoRemainingMs(form, now = Date.now()) {
      if (!form || !form.stepOneSubmittedAt) return 0;
      const submittedAt = Date.parse(form.stepOneSubmittedAt);
      if (!Number.isFinite(submittedAt)) return 0;
      const deadline = submittedAt + (TRAINING_UNDO_WINDOW_MINUTES * 60 * 1000);
      return Math.max(0, deadline - now);
    }

    function getTrainingUndoRemainingMinutes(form, now = Date.now()) {
      const remainingMs = getTrainingUndoRemainingMs(form, now);
      return remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0;
    }

    function canUndoTrainingForm(form, user = currentUser()) {
      if (!form || !user) return false;
      if (form.status !== TRAINING_STATUSES.PENDING_SIGNOFF) return false;
      if (form.stepTwoPrintedAt || form.signedFiles?.length) return false;
      if (!canManageTrainingForm(form, user)) return false;
      return getTrainingUndoRemainingMs(form) > 0;
    }

    function isTrainingVisible(form, user = currentUser()) {
      if (!form || !user) return false;
      if (hasGlobalReadScope(user)) return true;
      return hasUnitAccess(form.unit, user) || form.fillerUsername === user.username;
    }

    return {
      isAdmin,
      isUnitAdmin,
      isViewer,
      hasGlobalReadScope,
      hasUnitAccess,
      canCreateCAR,
      canReview,
      canReviewItem,
      canFillChecklist,
      canFillTraining,
      canManageUsers,
      getVisibleItems,
      canAccessItem,
      isItemHandler,
      canRespondItem,
      canSubmitTracking,
      isChecklistOwner,
      canAccessChecklist,
      getVisibleChecklists,
      canEditChecklist,
      getVisibleTrainingForms,
      canEditTrainingForm,
      canManageTrainingForm,
      isTrainingManualRowOwner,
      canDeleteTrainingEditableRow,
      getTrainingUndoRemainingMs,
      getTrainingUndoRemainingMinutes,
      canUndoTrainingForm,
      isTrainingVisible
    };
  };
})();

