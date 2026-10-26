package br.com.navitasassist.service;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.WorkflowRepository;
import br.com.navitasassist.workflow.WorkflowDocument.*;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class WorkflowService {
    private final WorkflowRepository repository;
    private final WorkflowPublicationValidator validator;

    @Transactional(readOnly = true)
    public Published published() {
        return repository.published(false);
    }

    public Published lockPublished() {
        // A locking read avoids a stale MySQL repeatable-read snapshot before the RMA lock.
        return repository.published(true);
    }

    @Transactional(readOnly = true)
    public Draft draft() {
        return repository.draft();
    }

    public Draft startDraft() {
        lockPublished();
        if (draft().definition() == null) repository.copyPublishedToDraft();
        return draft();
    }

    public Draft saveDraft(SaveDraft request) {
        lockPublished();
        check(request.expectedRevision());
        if (draft().definition() == null) throw new BusinessException("Start a draft first.");
        repository.saveDraft(request.definition());
        return draft();
    }

    public void discard(long revision) {
        lockPublished();
        check(revision);
        repository.discardDraft();
    }

    public Published publish(PublishRequest request) {
        Published current = lockPublished();
        check(request.expectedRevision());
        Definition definition = draft().definition();
        if (definition == null) throw new BusinessException("No workflow draft to publish.");
        validator.validate(definition, current.definition());
        long version = current.version() + 1;
        repository.publish(version, definition);
        return new Published(version, definition);
    }

    private void check(long revision) {
        if (draft().revision() != revision)
            throw new BusinessException("Workflow draft changed. Refresh before trying again.");
    }

    public static Status status(Published workflow, String code) {
        return workflow.definition().statuses().stream()
                .filter(s -> s.code().equals(code))
                .findFirst()
                .orElseThrow(() -> new BusinessException("Unknown workflow status: " + code));
    }
}
