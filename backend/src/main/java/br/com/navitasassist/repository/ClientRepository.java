package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.client.Client;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<Client, Long> {

    List<Client> findAllByOrderByLegalNameAscIdAsc();
}
