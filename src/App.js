import React, { useEffect, useState } from "react";
import axios from "axios";
import pkceChallenge from "pkce-challenge";
import {
  CLIENT_ID,
  REDIRECT_URI,
  SMART_AUTH_URL,
  SMART_TOKEN_URL,
  FHIR_BASE_URL,
  CODE_VERIFIER_LOCAL_STORAGE_KEY,
  TOKEN_RESPONSE_LOCAL_STORAGE_KEY,
} from "./config";

const App = () => {
  const [tokenResponse, setTokenResponse] = useState(null);
  const [patientName, setName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patientData, setPatientData] = useState(null);
  const [medications, setMedications] = useState([]);
  const [labReports, setLabReports] = useState([]);
  const [vitalSigns, setVitalSigns] = useState([]);
  // Fetches the patient data using the patient ID from the token response.
  // Updates the state with the patient data.
  useEffect(() => {
    console.log("Component mounted");
    let tokenResponseString;
    const code = new URL(window.location.href).searchParams.get("code");
    const codeVerifier = localStorage.getItem(CODE_VERIFIER_LOCAL_STORAGE_KEY); //how come no error here?
    tokenResponseString = localStorage.getItem(
      TOKEN_RESPONSE_LOCAL_STORAGE_KEY
    );
    const fetchPatientData = async (patientId) => {
      console.log("Fetching patient data - fetchPatientData called");
      try {
        const response = await axios.get(
          `${FHIR_BASE_URL}/Patient/${patientId}`,
          {
            headers: {
              Authorization: `Bearer ${tokenResponseString.access_token}`,
            },
          }
        );
        console.log("Patient Data =>", response.data);
        setPatientData(response.data);
      } catch (error) {
        console.error("Error fetching patient data:", error);
      }
    };

    if (tokenResponseString) {
      tokenResponseString = JSON.parse(tokenResponseString);
      let patientId = tokenResponseString.patient;
      console.log("patientId =>", patientId);
      if (patientData) {
        console.log("patientData =>", patientData);
        setName(patientData.name[0].text);
        setGender(patientData.gender);
        setDateOfBirth(patientData.birthDate);
        setPatientId(patientId);
      } else {
        fetchPatientData(patientId);
      }
    } else {
      if (code && codeVerifier) {
        const fetchData = async () => {
          await makeTokenRequest(code, codeVerifier);
          localStorage.removeItem(CODE_VERIFIER_LOCAL_STORAGE_KEY);
        };
        fetchData();
        // if (tokenResponseString) {
        //   tokenResponseString = JSON.parse(tokenResponseString);
        //   let patientId = tokenResponseString.patient;
        //   fetchPatientData(patientId);
        // }
        console.log(
          "tokenResponseString after fetchData() =>",
          tokenResponseString
        );
      } else {
        console.log("No code found");
      }
    }
  }, [patientData, tokenResponse]);

  const initiateAuthorizationRequest = async () => {
    const codeChallenge = await generateCodeChallenge();
    window.location.href = generateRedirectUrl(codeChallenge);
  };

  // generates a PKCE code challenge and stores the code verifier in local storage.
  // The code verifier is stored in with the key specified by CODE_VERIFIER_LOCAL_STORAGE_KEY.
  // Returns the generated code challenge, which will be used in the authorization request.
  const generateCodeChallenge = async () => {
    const { code_verifier, code_challenge } = await pkceChallenge();
    localStorage.setItem(CODE_VERIFIER_LOCAL_STORAGE_KEY, code_verifier);
    return code_challenge;
  };

  // Generates the authorization URL with the code challenge.
  // Returns the generated authorization URL.
  function generateRedirectUrl(codeChallenge) {
    const authorizationUrl = new URL(SMART_AUTH_URL);
    authorizationUrl.searchParams.set("client_id", CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid fhirUser");
    authorizationUrl.searchParams.set("aud", FHIR_BASE_URL);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    return authorizationUrl.href; //what is the href property in authorizationUrl?
  }

  // Makes a token request with the code and code verifier.
  // Stores the token response in local storage.
  const makeTokenRequest = async (code, codeVerifier) => {
    const tokenRequestForm = new FormData();
    tokenRequestForm.set("grant_type", "authorization_code");
    tokenRequestForm.set("code", code);
    tokenRequestForm.set("redirect_uri", REDIRECT_URI);
    tokenRequestForm.set("client_id", CLIENT_ID);
    tokenRequestForm.set("code_verifier", codeVerifier);
    try {
      const response = await axios.postForm(SMART_TOKEN_URL, tokenRequestForm);
      console.log(response);
      setTokenResponse(response.data);
      console.log("response.data.patient =>", response.data.patient);
      localStorage.setItem(
        TOKEN_RESPONSE_LOCAL_STORAGE_KEY,
        JSON.stringify(response.data)
      );
    } catch (error) {
      console.error("Error making token request:", error);
    }
  };

  const listMedications = async () => {
    function getMedications(response) {
      const medications = response.entry
        .filter((entry) => entry.resource.resourceType === "MedicationRequest")
        .map((entry) => entry.resource.medicationReference.display);
      return medications;
    }
    console.log("Listing Medications");

    // Retrieve the token from local storage
    const tokenResponse = JSON.parse(
      localStorage.getItem(TOKEN_RESPONSE_LOCAL_STORAGE_KEY)
    );
    const accessToken = tokenResponse?.access_token;
    console.log("accessToken =>", accessToken);
    if (!accessToken) {
      console.error("Access token not found.");
      return;
    }

    // Construct the URL
    const url = `${FHIR_BASE_URL}/MedicationRequest?subject=${patientId}`; //is this subject or patient?
    console.log("url =>", url);
    // Make the request
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Medications: ", response.data);
      setMedications(getMedications(response.data));
    } catch (error) {
      console.error("Failed to list medications: ", error);
    }
  };

  const listLabReports = async () => {
    function getLabReports(response) {
      const labReports = response.entry
        .filter((entry) => entry.resource.resourceType === "Observation")
        .map((entry) => ({
          name: entry.resource.code.text,
          value: entry.resource.valueQuantity?.value,
          unit: entry.resource.valueQuantity?.unit || "N/A",
        }));
      return labReports;
    }
    console.log("Listing Lab Reports");

    // Retrieve the token from local storage
    const tokenResponse = JSON.parse(
      localStorage.getItem(TOKEN_RESPONSE_LOCAL_STORAGE_KEY)
    );
    const accessToken = tokenResponse?.access_token;
    console.log("accessToken =>", accessToken);
    if (!accessToken) {
      console.error("Access token not found.");
      return;
    }

    // Construct the URL
    const url = `${FHIR_BASE_URL}/Observation?subject=${patientId}&category=laboratory`;
    console.log("url =>", url);
    // Make the request
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Lab Reports: ", response.data);
      setLabReports(getLabReports(response.data));
    } catch (error) {
      console.error("Failed to list lab reports: ", error);
    }
  };

  const listVitalSigns = async () => {
    function getVitalSigns(response) {
      const vitalSigns = response.entry
        .filter((entry) => entry.resource.resourceType === "Observation")
        .map((entry) => {
          const observationDate = entry.resource.effectiveDateTime || "N/A";
          if (entry.resource.component) {
            return entry.resource.component.map((component) => ({
              name: component.code.text,
              value: component.valueQuantity?.value,
              unit: component.valueQuantity?.unit || "N/A",
              date: observationDate,
            }));
          } else {
            return {
              name: entry.resource.code.text,
              value: entry.resource.valueQuantity?.value,
              unit: entry.resource.valueQuantity?.unit || "N/A",
              date: observationDate,
            };
          }
        })
        .flat();
      return vitalSigns;
    }
    console.log("Listing Vital Signs");

    // Retrieve the token from local storage
    const tokenResponse = JSON.parse(
      localStorage.getItem(TOKEN_RESPONSE_LOCAL_STORAGE_KEY)
    );
    const accessToken = tokenResponse?.access_token;
    console.log("accessToken =>", accessToken);
    if (!accessToken) {
      console.error("Access token not found.");
      return;
    }

    // Construct the URL
    const url = `${FHIR_BASE_URL}/Observation?patient=${patientId}&category=vital-signs&_sort=date`;
    console.log("url =>", url);
    // Make the request
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json", //is this necessary?
        },
      });

      console.log("Vital Signs: ", response.data);
      setVitalSigns(getVitalSigns(response.data));
    } catch (error) {
      console.error("Failed to list vital signs: ", error);
    }
  };

  return (
    <div>
      {patientData ? (
        <div>
          <h1>Patient Data</h1>
          <p>Name: {patientName ? patientName : "No name found"}</p>
          <p>Gender: {gender ? gender : "No gender found"}</p>
          <p>
            Date of Birth:{" "}
            {dateOfBirth ? dateOfBirth : "No date of birth found"}
          </p>
          <p>Patient ID: {patientId}</p>
          <div>
            <button onClick={listMedications}>List Medications</button>
            <button onClick={listLabReports}>List Lab Reports</button>
            <button onClick={listVitalSigns}>List Vital Signs</button>
          </div>
          {medications.length > 0 && (
            <div>
              <h1>Medications</h1>
              <ul>
                {medications.map((medication) => (
                  <li key={medication}>{medication}</li>
                ))}
              </ul>
            </div>
          )}
          {labReports.length > 0 && (
            <div>
              <h1>Lab Reports</h1>
              <ul>
                {labReports.map((labReport, index) => (
                  <li key={index}>
                    {labReport.name}: {labReport.value} {labReport.unit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {vitalSigns.length > 0 && (
            <div>
              <h1>Vital Signs</h1>
              <ul>
                {vitalSigns.map((vitalSign, index) => (
                  <li key={index}>
                    {vitalSign.name}: {vitalSign.value} {vitalSign.unit} (Date:{" "}
                    {vitalSign.date})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <button onClick={initiateAuthorizationRequest}>
          Sign in with Epic
        </button>
      )}
    </div>
  );
};

export default App;
