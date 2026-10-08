from fabrica import pessoa
from radar_analytics.domain.anonimizacao import aliases_tasks, limpar_texto, pseudonimos
from radar_analytics.domain.skills import chave_skill, encaixe

ANA = pessoa("p1", nome="Ana Lima", funcao="Front-end", skills=("react",))
BIA = pessoa("p2", nome="Bia", funcao=None)


def test_pseudonimos_estaveis_por_id() -> None:
    nomes = pseudonimos([BIA, ANA])
    assert nomes == {"p1": "Dev Front-end react #A", "p2": "Dev do time #B"}


def test_letras_passam_de_z() -> None:
    muitos = [pessoa(f"p{i:03d}") for i in range(28)]
    nomes = pseudonimos(muitos)
    assert nomes["p026"].endswith("#AA")
    assert nomes["p027"].endswith("#AB")


def test_aliases_de_task() -> None:
    assert aliases_tasks([42, 7, 42]) == {7: "T1", 42: "T2"}


def test_limpar_texto_tira_nomes_e_emails() -> None:
    nomes = pseudonimos([ANA, BIA])
    txt = limpar_texto("Revisar com Ana Lima e ana (ana.lima@iport.com) - Bia, Biazinha", [ANA, BIA], nomes)
    assert "Ana" not in txt
    assert "@" not in txt
    assert "Dev Front-end react #A" in txt
    assert "Biazinha" in txt  # nome curto (< 3 letras não; "Bia" tem 3) só como palavra inteira
    assert "Dev do time #B," in txt


def test_chave_e_encaixe_de_skill() -> None:
    assert chave_skill("Back-end") == chave_skill("backend") == "backend"
    assert chave_skill("Integração Fiscal") == "integracaofiscal"
    assert encaixe([], ["x"]) == 1
    assert encaixe(["seed-radar"], ["x"]) == 1
    assert encaixe(["React", "SQL"], ["react"]) == 0.5
