FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=build --chown=10001:10001 /app/target/*.jar app.jar

RUN chown 10001:10001 /app
USER 10001

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
