from radar_analytics import numeros


def test_arredonda_meio_para_cima() -> None:
    assert numeros.horas(2.25) == 2.3
    assert numeros.horas(2.35) == 2.4
    assert numeros.pct(1.175) == 118.0
    assert numeros.indice(0.125) == 0.13


def test_pct_de_zero() -> None:
    assert numeros.pct(0) == 0.0
