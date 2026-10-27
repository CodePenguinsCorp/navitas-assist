package br.com.navitasassist.rma;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@Entity
@Table(name = "rma_code_generation_lock")
public class RmaCodeGenerationLock {

    @Id
    private Long id;
}
