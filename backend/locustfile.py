import time
from locust import HttpUser, task, between

class DynoCodeUser(HttpUser):
    # Simulated wait time between user actions (1-3 seconds)
    wait_time = between(1, 3)

    @task(3)
    def view_problems(self):
        """Tests the public problem listing endpoint."""
        self.client.get("/problems")

    @task(1)
    def health_check(self):
        """Tests the health check endpoint."""
        self.client.get("/health")

    # Note: /run and /submit require Authentication.
    # To test them, you would need to provide a Bearer token.
    # @task(2)
    # def run_code(self):
    #     self.client.post("/run", json={"code": "print('Test')", "input": ""}, headers={"Authorization": "Bearer YOUR_TOKEN"})
