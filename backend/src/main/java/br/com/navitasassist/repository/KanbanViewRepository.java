package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.kanban.KanbanView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface KanbanViewRepository extends JpaRepository<KanbanView, Long> {

    List<KanbanView> findAllByOwnerIdOrderByNameAsc(Long ownerId);

    Optional<KanbanView> findByIdAndOwnerId(Long id, Long ownerId);

    boolean existsByOwnerIdAndNameIgnoreCase(Long ownerId, String name);

    boolean existsByOwnerIdAndNameIgnoreCaseAndIdNot(Long ownerId, String name, Long id);

    @Modifying
    @Query("update KanbanView view set view.defaultView = false where view.owner.id = :ownerId and view.defaultView = true")
    void clearDefaultByOwnerId(@Param("ownerId") Long ownerId);

    @Modifying
    @Query("""
        update KanbanView view
        set view.defaultView = false
        where view.owner.id = :ownerId and view.id <> :viewId and view.defaultView = true
        """)
    void clearOtherDefaults(@Param("ownerId") Long ownerId, @Param("viewId") Long viewId);
}
